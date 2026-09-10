import { AudioSession } from '@livekit/react-native';
import { ConnectionState, type Participant, Room, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DATA_TOPIC, decodeAgentMessage, encodeDataMessage } from '@care/shared';

import { NotPairedError, fetchPatientConnection } from '@/lib/connection';
import { FALLBACK_MESSAGES, speakFallback, stopFallbackSpeech } from '@/lib/speech-fallback';

export type AgentUiState = 'listening' | 'thinking' | 'speaking' | 'idle';

export interface ActiveCall {
  requestId: string;
  contactName: string;
}

export interface PendingContact {
  requestId: string;
  contactName: string;
  status: string;
}

export interface CompanionRoomState {
  status: 'connecting' | 'connected' | 'reconnecting' | 'error' | 'not_paired' | 'ended';
  assistantName: string;
  caption: string;
  agentState: AgentUiState;
  call: ActiveCall | null;
  pendingContact: PendingContact | null;
  errorMessage: string | null;
}

const INITIAL_STATE: CompanionRoomState = {
  status: 'connecting',
  assistantName: 'Companion',
  caption: '',
  agentState: 'idle',
  call: null,
  pendingContact: null,
  errorMessage: null,
};

const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Owns the LiveKit room for the patient: connects, publishes the microphone, reacts to
 * agent data messages, and reconnects with backoff. The UI only reads state and calls
 * `hangUp` / `retry`.
 */
export function useCompanionRoom(circleId: string): CompanionRoomState & { hangUp: () => void; retry: () => void } {
  const [state, setState] = useState<CompanionRoomState>(INITIAL_STATE);
  const roomRef = useRef<Room | null>(null);
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const update = useCallback((patch: Partial<CompanionRoomState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const scheduleRetry = useCallback(
    (connect: () => Promise<void>) => {
      if (disposed.current) {
        return;
      }
      const delay = Math.min(MAX_RETRY_DELAY_MS, 2_000 * 2 ** retryAttempt.current);
      retryAttempt.current += 1;
      retryTimer.current = setTimeout(() => void connect(), delay);
    },
    [],
  );

  const connect = useCallback(async () => {
    if (disposed.current) {
      return;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    await roomRef.current?.disconnect().catch(() => undefined);
    update({ status: 'connecting', errorMessage: null, call: null });

    let connection;
    try {
      connection = await fetchPatientConnection(circleId);
    } catch (caught) {
      if (caught instanceof NotPairedError) {
        update({ status: 'not_paired', errorMessage: caught.message });
        speakFallback(FALLBACK_MESSAGES.notPaired);
        return;
      }
      update({ status: 'error', errorMessage: caught instanceof Error ? caught.message : String(caught) });
      speakFallback(retryAttempt.current === 0 ? FALLBACK_MESSAGES.trouble : FALLBACK_MESSAGES.offline);
      scheduleRetry(connect);
      return;
    }

    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    room
      .on(RoomEvent.Connected, () => {
        retryAttempt.current = 0;
        stopFallbackSpeech();
        update({ status: 'connected' });
      })
      .on(RoomEvent.Reconnecting, () => update({ status: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => update({ status: 'connected' }))
      .on(RoomEvent.Disconnected, () => {
        if (disposed.current) {
          return;
        }
        update({ status: 'error', call: null, agentState: 'idle' });
        speakFallback(FALLBACK_MESSAGES.trouble);
        scheduleRetry(connect);
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, _participant?: Participant, _kind?: unknown, topic?: string) => {
        if (topic !== DATA_TOPIC) {
          return;
        }
        const message = decodeAgentMessage(payload);
        if (!message) {
          return;
        }
        switch (message.type) {
          case 'agent_ready':
            update({ assistantName: message.assistantName });
            break;
          case 'caption':
            update({ caption: message.text });
            break;
          case 'agent_state':
            update({ agentState: message.state });
            break;
          case 'contact_request_status':
            update({
              pendingContact:
                message.status === 'pending' || message.status === 'accepted'
                  ? { requestId: message.requestId, contactName: message.contactName, status: message.status }
                  : null,
            });
            break;
          case 'call_started':
            update({ call: { requestId: message.requestId, contactName: message.contactName }, pendingContact: null });
            break;
          case 'call_ended':
            update({ call: null });
            break;
          case 'session_ending':
            update({ status: 'ended' });
            break;
        }
      });

    try {
      await AudioSession.startAudioSession();
      await room.connect(connection.url, connection.token);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (caught) {
      update({ status: 'error', errorMessage: caught instanceof Error ? caught.message : String(caught) });
      speakFallback(FALLBACK_MESSAGES.trouble);
      scheduleRetry(connect);
    }
  }, [circleId, scheduleRetry, update]);

  useEffect(() => {
    disposed.current = false;
    void AudioSession.configureAudio({
      android: { preferredOutputList: ['speaker'], audioTypeOptions: { manageAudioFocus: true } },
      ios: { defaultOutput: 'speaker' },
    });
    void connect();

    return () => {
      disposed.current = true;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
      void roomRef.current?.disconnect();
      void AudioSession.stopAudioSession();
      stopFallbackSpeech();
    };
  }, [connect]);

  const hangUp = useCallback(() => {
    const room = roomRef.current;
    const call = state.call;
    if (!room || !call || room.state !== ConnectionState.Connected) {
      return;
    }
    void room.localParticipant.publishData(encodeDataMessage({ type: 'hang_up', requestId: call.requestId }), {
      reliable: true,
      topic: DATA_TOPIC,
    });
  }, [state.call]);

  const retry = useCallback(() => {
    retryAttempt.current = 0;
    void connect();
  }, [connect]);

  return { ...state, hangUp, retry };
}
