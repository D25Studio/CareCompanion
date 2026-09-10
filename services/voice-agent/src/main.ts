/**
 * Care Companion voice agent.
 *
 * One job per patient room. The agent loads the circle's settings, builds the
 * dementia-aware prompt, talks with the patient through OpenAI Realtime, and hands the
 * room over to a family member when a contact request is accepted.
 *
 * Run locally:  pnpm dev        (connects to LiveKit Cloud, dispatched by the token function)
 * Terminal test: pnpm console   (talk to the agent from this terminal; uses a fake circle)
 */
import { type JobContext, ServerOptions, cli, defineAgent, voice } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { RoomEvent } from '@livekit/rtc-node';
import { fileURLToPath } from 'node:url';

import {
  DATA_TOPIC,
  GREETING_INSTRUCTIONS,
  buildSystemPrompt,
  circleIdFromRoomName,
  decodeCompanionMessage,
  describeLocalTime,
  patientIdentity,
} from '@care/shared';

import { CallBridge } from './call-bridge.ts';
import { getConfig } from './config.ts';
import { DataChannel } from './data-channel.ts';
import { type CircleContext, fromRows, loadCircleContext, toPromptMembers } from './session-context.ts';
import { SessionLogger } from './session-logger.ts';
import { getAdminClient } from './supabase.ts';
import { type SessionServices, createTools } from './tools.ts';

interface DispatchMetadata {
  circleId?: string;
  patientId?: string;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const config = getConfig();
    const admin = getAdminClient();

    await ctx.connect();

    const roomName = ctx.room.name ?? '';
    const metadata = parseMetadata(ctx.job.metadata);
    const circleId = metadata.circleId ?? circleIdFromRoomName(roomName);

    // Resolve the patient: dispatch metadata first, then the first patient:* participant.
    let patientId = metadata.patientId ?? null;
    if (!patientId) {
      const participant = await ctx.waitForParticipant();
      patientId = participant.identity.startsWith('patient:') ? participant.identity.slice('patient:'.length) : null;
    }

    let context: CircleContext;
    if (circleId && patientId) {
      try {
        context = await loadCircleContext(admin, circleId, patientId);
      } catch (caught) {
        console.error('[agent] could not load circle context, using safe defaults', caught);
        context = fromRows(circleId, patientId, null, [], new Map());
      }
    } else {
      // Console mode or a room created outside the token function.
      console.warn('[agent] no circle/patient in metadata; running with defaults');
      context = fromRows(circleId ?? 'console', patientId ?? 'console', null, [], new Map());
    }

    const logger = new SessionLogger(admin, context, roomName);
    if (circleId && patientId) {
      await logger.start();
    }

    const dataChannel = new DataChannel(ctx.room, patientIdentity(context.patientId));

    const instructions = buildSystemPrompt({
      patientPreferredName: context.patientPreferredName,
      condition: context.condition,
      stage: context.stage,
      assistantName: context.assistantName,
      orientationFacts: context.orientationFacts,
      customGuidance: context.customGuidance,
      members: toPromptMembers(context),
      localTimeDescription: describeLocalTime(new Date(), config.SUMMARY_TIMEZONE),
    });

    const session = new voice.AgentSession<SessionServices>({
      llm: new openai.realtime.RealtimeModel({
        model: config.REALTIME_MODEL,
        voice: context.assistantVoice,
        speed: context.speakingRate,
        // Generous settings: people with dementia pause mid-sentence. Avoid cutting them off.
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 400,
          silence_duration_ms: 1200,
          create_response: true,
          interrupt_response: true,
        },
      }),
      // Patients often speak slowly; a long "away" timeout keeps the session from idling out.
      userAwayTimeout: 120,
      // userData is attached below once services exist.
    });

    const callBridge = new CallBridge(ctx.room, session, admin, context, logger, dataChannel);
    session.userData = { job: ctx, admin, context, logger, dataChannel, callBridge };

    const agent = voice.Agent.create<SessionServices>({
      instructions,
      tools: createTools(),
    });

    wireSessionEvents(session, logger, dataChannel);
    wireQuietCheckIn(session, callBridge);
    wireRoomEvents(ctx, callBridge);

    ctx.addShutdownCallback(async () => {
      callBridge.detach();
      await logger.end();
    });

    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        participantIdentity: patientIdentity(context.patientId),
        closeOnDisconnect: true,
      },
    });

    callBridge.attach();
    await dataChannel.send({ type: 'agent_ready', assistantName: context.assistantName });

    session.generateReply({ instructions: GREETING_INSTRUCTIONS });
  },
});

function parseMetadata(raw: string | undefined): DispatchMetadata {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as DispatchMetadata;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Mirrors the conversation to the session log and the Companion app captions. */
function wireSessionEvents(session: voice.AgentSession<SessionServices>, logger: SessionLogger, dataChannel: DataChannel): void {
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
    const item = event.item;
    if (item.type !== 'message') {
      return;
    }
    const text = item.textContent?.trim();
    if (!text) {
      return;
    }
    if (item.role === 'user') {
      logger.recordPatientSaid(text);
    } else if (item.role === 'assistant') {
      logger.recordAssistantSaid(text);
      void dataChannel.send({ type: 'caption', text, final: true });
    }
  });

  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    const state =
      event.newState === 'speaking'
        ? 'speaking'
        : event.newState === 'thinking'
          ? 'thinking'
          : event.newState === 'listening'
            ? 'listening'
            : 'idle';
    void dataChannel.send({ type: 'agent_state', state });
  });

  session.on(voice.AgentSessionEventTypes.Error, (event) => {
    console.error('[agent] session error', event.error);
  });

  session.on(voice.AgentSessionEventTypes.Close, () => {
    void logger.end();
  });
}

/**
 * After `userAwayTimeout` seconds of silence the patient is marked "away". Check in once,
 * gently, and then leave the silence alone: repeated prompting is confusing and can feel
 * like nagging. The flag resets as soon as the patient speaks again.
 */
function wireQuietCheckIn(session: voice.AgentSession<SessionServices>, callBridge: CallBridge): void {
  let hasCheckedIn = false;

  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    if (event.newState === 'speaking') {
      hasCheckedIn = false;
      return;
    }
    if (event.newState !== 'away' || hasCheckedIn || callBridge.isInCall) {
      return;
    }
    hasCheckedIn = true;
    session.generateReply({ instructions: QUIET_CHECK_IN_INSTRUCTIONS });
  });
}

const QUIET_CHECK_IN_INSTRUCTIONS =
  'The person has been quiet for a while. Check in once with one short, warm sentence, ' +
  'for example asking if they are still there or if they would like to keep chatting. ' +
  'If they do not answer, do not ask again; simply wait quietly.';

/** Patient-side signals arrive over the data channel. */
function wireRoomEvents(ctx: JobContext, callBridge: CallBridge): void {
  ctx.room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic !== DATA_TOPIC) {
      return;
    }
    const message = decodeCompanionMessage(payload);
    if (!message) {
      return;
    }
    if (message.type === 'hang_up') {
      void callBridge.hangUp();
    }
  });
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: getConfig().LIVEKIT_AGENT_NAME,
    wsURL: getConfig().LIVEKIT_URL,
    apiKey: getConfig().LIVEKIT_API_KEY,
    apiSecret: getConfig().LIVEKIT_API_SECRET,
  }),
);
