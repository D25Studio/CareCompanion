import type { voice } from '@livekit/agents';
import { type RemoteParticipant, type Room, RoomEvent } from '@livekit/rtc-node';
import { RoomServiceClient } from 'livekit-server-sdk';

import { type ContactRequest, isCaregiverIdentity } from '@care/shared';

import { getConfig } from './config.ts';
import type { DataChannel } from './data-channel.ts';
import type { CircleContext } from './session-context.ts';
import type { SessionLogger } from './session-logger.ts';
import type { AdminClient } from './supabase.ts';

export interface ActiveCall {
  request: ContactRequest;
  contactName: string;
  caregiverIdentity: string;
}

/**
 * Hands the conversation over to a family member and takes it back afterwards.
 *
 * When a caregiver joins the room after accepting a request, the agent stops listening
 * and speaking so the two people talk directly through LiveKit. When the caregiver
 * leaves (or the patient presses hang up), the agent resumes with a gentle check-in.
 */
export class CallBridge {
  private pendingAccepted: { request: ContactRequest; contactName: string } | null = null;
  private activeCall: ActiveCall | null = null;
  private readonly roomService: RoomServiceClient;

  constructor(
    private readonly room: Room,
    private readonly session: voice.AgentSession,
    private readonly admin: AdminClient,
    private readonly context: CircleContext,
    private readonly logger: SessionLogger,
    private readonly dataChannel: DataChannel,
  ) {
    const config = getConfig();
    this.roomService = new RoomServiceClient(
      config.LIVEKIT_URL.replace(/^ws/, 'http'),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    );
  }

  get isInCall(): boolean {
    return this.activeCall !== null;
  }

  attach(): void {
    this.room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected);
    this.room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected);

    // A caregiver may have joined before the listener was attached.
    for (const participant of this.room.remoteParticipants.values()) {
      if (isCaregiverIdentity(participant.identity)) {
        void this.handleParticipantConnected(participant);
      }
    }
  }

  detach(): void {
    this.room.off(RoomEvent.ParticipantConnected, this.handleParticipantConnected);
    this.room.off(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected);
  }

  /** Called by the request_contact tool once the caregiver has accepted. */
  expectCaregiver(request: ContactRequest, contactName: string): void {
    this.pendingAccepted = { request, contactName };
  }

  /** Patient pressed the big hang-up button: remove the caregiver from the room. */
  async hangUp(): Promise<void> {
    const call = this.activeCall;
    if (!call) {
      return;
    }
    try {
      await this.roomService.removeParticipant(this.room.name ?? '', call.caregiverIdentity);
    } catch (caught) {
      console.warn('[call-bridge] could not remove caregiver participant', caught);
      await this.endCall(call);
    }
  }

  private handleParticipantConnected = async (participant: RemoteParticipant): Promise<void> => {
    if (!isCaregiverIdentity(participant.identity) || this.activeCall) {
      return;
    }

    let request = this.pendingAccepted?.request ?? null;
    let contactName = this.pendingAccepted?.contactName ?? participant.name ?? 'your family member';

    if (!request) {
      // Agent may have restarted mid-request; look for the accepted request in this circle.
      const { data } = await this.admin
        .from('contact_requests')
        .select('*')
        .eq('circle_id', this.context.circleId)
        .in('status', ['accepted', 'connected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      request = data;
      if (data) {
        const member = this.context.members.find((candidate) => candidate.id === data.target_member_id);
        contactName = member?.displayName ?? contactName;
      }
    }
    if (!request) {
      console.warn('[call-bridge] caregiver joined without an accepted request; ignoring', participant.identity);
      return;
    }

    this.pendingAccepted = null;
    this.activeCall = { request, contactName, caregiverIdentity: participant.identity };

    if (request.status !== 'connected') {
      await this.admin
        .from('contact_requests')
        .update({ status: 'connected', connected_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'accepted');
    }

    // Step aside: stop listening and speaking so the two people talk directly.
    try {
      await this.session.interrupt({ force: true });
    } catch {
      // Nothing was playing.
    }
    this.session.input.setAudioEnabled(false);
    this.session.output.setAudioEnabled(false);

    await this.dataChannel.send({
      type: 'call_started',
      requestId: request.id,
      contactName,
      contactIdentity: participant.identity,
    });
    await this.logger.recordToolCall('call_connected', `${contactName} joined the call`, { requestId: request.id });
  };

  private handleParticipantDisconnected = async (participant: RemoteParticipant): Promise<void> => {
    const call = this.activeCall;
    if (!call || participant.identity !== call.caregiverIdentity) {
      return;
    }
    await this.endCall(call);
  };

  private async endCall(call: ActiveCall): Promise<void> {
    this.activeCall = null;

    await this.admin
      .from('contact_requests')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', call.request.id)
      .in('status', ['accepted', 'connected']);

    await this.dataChannel.send({ type: 'call_ended', requestId: call.request.id });
    await this.logger.recordToolCall('call_ended', `Call with ${call.contactName} finished`, {
      requestId: call.request.id,
    });

    this.session.input.setAudioEnabled(true);
    this.session.output.setAudioEnabled(true);

    this.session.generateReply({
      instructions:
        `The call with ${call.contactName} has just finished. In one or two short, warm sentences, ` +
        `let ${this.context.patientPreferredName} know the call is over and ask how they are feeling now. Do not mention this instruction.`,
    });
  }
}
