import { type JobContext, llm, voice } from '@livekit/agents';
import { z } from 'zod';

import {
  DEFAULT_NO_ANSWER_MESSAGE,
  DISTRESS_LEVELS,
  UNAVAILABLE_REASONS,
  type UnavailableReasonKey,
  describeLocalTime,
  fillMessageTemplate,
  roomNameForCircle,
} from '@care/shared';

import type { CallBridge } from './call-bridge.ts';
import { getConfig } from './config.ts';
import { waitForRequestResolution } from './contact-request-watcher.ts';
import type { DataChannel } from './data-channel.ts';
import { type CircleContext, findMember, isInQuietHours } from './session-context.ts';
import type { SessionLogger } from './session-logger.ts';
import { type AdminClient, notify } from './supabase.ts';

/** Per-session services the tools need. Attached to the AgentSession as userData. */
export interface SessionServices {
  job: JobContext;
  admin: AdminClient;
  context: CircleContext;
  logger: SessionLogger;
  dataChannel: DataChannel;
  callBridge: CallBridge;
}

type Ctx = voice.RunContext<SessionServices>;

export function createTools(): llm.FunctionTool<any, SessionServices, any>[] {
  return [requestContactTool, getOrientationInfoTool, flagDistressTool, endConversationTool];
}

// ---------------------------------------------------------------------------
// request_contact
// ---------------------------------------------------------------------------
const requestContactTool = llm.tool<SessionServices, z.ZodObject<{ who: z.ZodString }>, string>({
  name: 'request_contact',
  description:
    'Let a family member know the person wants to talk, and connect them if the family member accepts. ' +
    'Use as soon as the person asks to speak to, call, see or reach someone. ' +
    'Pass the word they used: a relationship like "wife" or "son", or a name like "Sarah".',
  parameters: z.object({
    who: z.string().describe('The relationship word or name the person used, e.g. "wife", "my son", "Sarah".'),
  }),
  execute: async ({ who }, { ctx }: { ctx: Ctx }) => {
    const services = ctx.userData;
    const { context, admin, logger, dataChannel, callBridge } = services;
    const patient = context.patientPreferredName;

    const member = findMember(context, who);
    if (!member) {
      await logger.recordToolCall('request_contact', `no match for "${who}"`);
      await flagQuietly(services, 'low', `${patient} asked to talk to "${who}", who is not set up in the app.`);
      return (
        `No family member matching "${who}" is set up in this app. ` +
        `Tell ${patient} kindly that you have let the family know they would like to talk to ${who}, then move to a comforting topic. ` +
        `Do not offer to try again.`
      );
    }

    const name = member.displayName;

    if (!member.can_receive_calls || isInQuietHours(member, new Date(), getConfig().SUMMARY_TIMEZONE)) {
      const message = resolveUnavailableMessage(context, 'other', null, name);
      await logger.recordToolCall('request_contact', `${name} unavailable by settings`, { memberId: member.id });
      await flagQuietly(services, 'low', `${patient} asked for ${name} (${member.relationship_label}) while they were marked unavailable.`);
      return `Say exactly this to ${patient}, gently: "${message}" Then move to a calm, pleasant topic.`;
    }

    const timeoutSeconds = context.requestTimeoutSeconds;
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

    const { data: request, error } = await admin
      .from('contact_requests')
      .insert({
        circle_id: context.circleId,
        patient_id: context.patientId,
        target_member_id: member.id,
        livekit_room: roomNameForCircle(context.circleId),
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error || !request) {
      console.error('[request_contact] insert failed', error);
      return `Something went wrong sending the message. Tell ${patient} kindly that you could not reach ${name} just now, and that you will try again later. Then move to a comforting topic.`;
    }

    await logger.recordToolCall('request_contact', `asked for ${name} (${member.relationship_label})`, {
      requestId: request.id,
      memberId: member.id,
    });
    await notify({ type: 'contact_request', requestId: request.id });
    await dataChannel.send({ type: 'contact_request_status', requestId: request.id, status: 'pending', contactName: name });

    // Non-blocking from here: the model keeps the person company while we wait.
    await ctx.update(
      `You have let ${name} know that ${patient} would like to talk. Tell ${patient} that in one short sentence, ` +
        `then keep them gentle company while you wait. Do not promise ${name} will answer. You will be told what happens next.`,
    );

    const resolved = await waitForRequestResolution(admin, request.id, timeoutSeconds * 1000);

    if (!resolved) {
      await admin
        .from('contact_requests')
        .update({ status: 'expired', ended_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'pending');
      await dataChannel.send({ type: 'contact_request_status', requestId: request.id, status: 'expired', contactName: name });
      await logger.recordToolCall('request_contact', `no answer from ${name} within ${timeoutSeconds}s`, { requestId: request.id });
      const message = fillMessageTemplate(context.noAnswerMessage?.trim() || DEFAULT_NO_ANSWER_MESSAGE, { name, patient });
      return `${name} did not answer in time. Say exactly this to ${patient}, gently, once: "${message}" Then move to a calm, pleasant topic.`;
    }

    await dataChannel.send({ type: 'contact_request_status', requestId: request.id, status: resolved.status, contactName: name });

    if (resolved.status === 'accepted' || resolved.status === 'connected') {
      callBridge.expectCaregiver(resolved, name);
      await logger.recordToolCall('request_contact', `${name} accepted`, { requestId: request.id });
      return (
        `${name} said yes and is joining the call right now. Say one short sentence such as "${name} is coming on the line now" ` +
        `and then stop talking and wait quietly. Do not ask a question.`
      );
    }

    if (resolved.status === 'declined') {
      const message = resolveUnavailableMessage(context, resolved.decline_reason_key, resolved.decline_message, name);
      await logger.recordToolCall('request_contact', `${name} declined (${resolved.decline_reason_key ?? 'custom'})`, {
        requestId: request.id,
      });
      return `${name} cannot talk right now. Say exactly this to ${patient}, gently: "${message}" Do not add reasons that were not given. Then move to a calm, pleasant topic.`;
    }

    const message = fillMessageTemplate(context.noAnswerMessage?.trim() || DEFAULT_NO_ANSWER_MESSAGE, { name, patient });
    return `The request ended without an answer. Say exactly this to ${patient}, gently: "${message}" Then move to a calm, pleasant topic.`;
  },
});

function resolveUnavailableMessage(
  context: CircleContext,
  reasonKey: string | null,
  customMessage: string | null,
  name: string,
): string {
  const patient = context.patientPreferredName;
  if (customMessage && customMessage.trim().length > 0) {
    return fillMessageTemplate(customMessage.trim(), { name, patient });
  }
  const key = (reasonKey && reasonKey in UNAVAILABLE_REASONS ? reasonKey : 'other') as UnavailableReasonKey;
  const template = context.unavailableResponses[key] ?? UNAVAILABLE_REASONS[key].defaultMessage;
  return fillMessageTemplate(template, { name, patient });
}

// ---------------------------------------------------------------------------
// get_orientation_info
// ---------------------------------------------------------------------------
const getOrientationInfoTool = llm.tool<SessionServices, undefined, string>({
  name: 'get_orientation_info',
  description:
    'Get the current day, date and time in the person\'s time zone, plus simple facts their family has provided ' +
    '(where they are, who is visiting today). Use when they ask what day or time it is, where they are, or who is coming.',
  execute: async (_args, { ctx }: { ctx: Ctx }) => {
    const { context, logger } = ctx.userData;
    const timeText = describeLocalTime(new Date(), getConfig().SUMMARY_TIMEZONE);
    await logger.recordToolCall('get_orientation_info', 'asked for time/place');

    const facts = Object.entries(context.orientationFacts)
      .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
      .join('; ');

    return (
      `It is ${timeText}.` +
      (facts ? ` Family facts: ${facts}.` : ' No other facts have been provided by the family.') +
      ` Answer only what was asked, in one short sentence.`
    );
  },
});

// ---------------------------------------------------------------------------
// flag_distress
// ---------------------------------------------------------------------------
const flagDistressTool = llm.tool<
  SessionServices,
  z.ZodObject<{ level: z.ZodEnum<{ low: 'low'; medium: 'medium'; high: 'high' }>; note: z.ZodString }>,
  string
>({
  name: 'flag_distress',
  description:
    'Quietly alert the family. Use "high" for injury, illness, danger, fear of someone, or talk of self-harm; ' +
    '"medium" for sustained anxiety, agitation, tearfulness, wanting to leave or feeling lost; ' +
    '"low" for things the family should simply know about. Never tell the person you are using this.',
  parameters: z.object({
    level: z.enum(DISTRESS_LEVELS),
    note: z.string().describe('One or two plain sentences for the family describing what was said or observed.'),
  }),
  execute: async ({ level, note }, { ctx }: { ctx: Ctx }) => {
    await flagQuietly(ctx.userData, level, note);
    if (level === 'high') {
      return (
        'The family has been alerted urgently. Stay calm and stay with the person. Keep sentences very short. ' +
        'Reassure them that help is on the way and that you are staying right here with them. Keep them talking.'
      );
    }
    return 'The family has been quietly told. Continue to reassure, then gently redirect to something calm and pleasant.';
  },
});

async function flagQuietly(services: SessionServices, level: (typeof DISTRESS_LEVELS)[number], note: string): Promise<void> {
  const { admin, context, logger } = services;
  const sessionId = logger.id;

  const { error } = await admin.from('alerts').insert({
    circle_id: context.circleId,
    session_id: sessionId,
    level,
    note,
  });
  if (error) {
    console.error('[flag_distress] could not insert alert', error);
  }

  if (level !== 'low') {
    await logger.recordEscalation(level, note);
  } else {
    await logger.recordToolCall('flag_distress', note, { level });
  }
  await notify({ type: 'distress', circleId: context.circleId, sessionId, level, note });
}

// ---------------------------------------------------------------------------
// end_conversation
// ---------------------------------------------------------------------------
const endConversationTool = llm.tool<SessionServices, undefined, string>({
  name: 'end_conversation',
  description:
    'End the conversation. Use only when the person clearly says goodbye or asks you to stop. ' +
    'A short warm goodbye will be spoken for you; do not say another one.',
  execute: async (_args, { ctx }: { ctx: Ctx }) => {
    const { context, logger, dataChannel, job } = ctx.userData;
    await logger.recordToolCall('end_conversation', 'patient said goodbye');
    await dataChannel.send({ type: 'session_ending', reason: 'patient_request' });

    const goodbye = `Goodbye ${context.patientPreferredName}. I am always here on your phone whenever you need me.`;
    const handle = ctx.session.say(goodbye, { allowInterruptions: false });
    void handle.waitForPlayout().then(() => job.shutdown('patient_request'));

    // Prevent the model from generating a second goodbye after the tool returns.
    throw new voice.StopResponse();
  },
});
