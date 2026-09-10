import { AudioSession } from '@livekit/react-native';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isPatientIdentity } from '@care/shared';

import { Button } from '@/components/ui';
import { fetchCaregiverConnection, friendlyError } from '@/lib/api';
import { useCircle } from '@/providers/CircleProvider';
import { colors, fontSizes, spacing } from '@/theme';

type CallStatus = 'connecting' | 'waiting' | 'connected' | 'ended' | 'error';

/**
 * Audio call with the patient. The caregiver joins the patient's LiveKit room; the voice
 * agent detects the join, steps aside, and shows the call screen on the patient's phone.
 */
export default function Call() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const { circle, settings } = useCircle();
  const patientName = settings?.preferred_name || 'your family member';

  const [status, setStatus] = useState<CallStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!circle || !requestId) {
      return;
    }
    let disposed = false;
    const room = new Room();
    roomRef.current = room;

    const updatePresence = () => {
      const patientPresent = [...room.remoteParticipants.values()].some((participant) => isPatientIdentity(participant.identity));
      setStatus(patientPresent ? 'connected' : 'waiting');
    };

    room
      .on(RoomEvent.Connected, updatePresence)
      .on(RoomEvent.ParticipantConnected, updatePresence)
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (isPatientIdentity(participant.identity)) {
          setStatus('ended');
        }
      })
      .on(RoomEvent.Disconnected, () => {
        if (!disposed) {
          setStatus('ended');
        }
      });

    (async () => {
      try {
        const connection = await fetchCaregiverConnection(circle.id, requestId);
        await AudioSession.startAudioSession();
        await room.connect(connection.url, connection.token);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (caught) {
        if (!disposed) {
          setError(friendlyError(caught));
          setStatus('error');
        }
      }
    })();

    return () => {
      disposed = true;
      void room.disconnect();
      void AudioSession.stopAudioSession();
    };
  }, [circle, requestId]);

  useEffect(() => {
    if (status !== 'connected') {
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const hangUp = async () => {
    await roomRef.current?.disconnect();
    router.replace('/(tabs)/requests');
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      return;
    }
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.name}>{patientName}</Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {status === 'connecting' && 'Connecting...'}
          {status === 'waiting' && 'Waiting for their phone...'}
          {status === 'connected' && formatDuration(seconds)}
          {status === 'ended' && 'Call ended'}
          {status === 'error' && (error ?? 'Could not connect')}
        </Text>
      </View>
      <View style={styles.controls}>
        {status === 'connected' || status === 'waiting' ? (
          <Button label={muted ? 'Unmute' : 'Mute'} variant="ghost" onPress={() => void toggleMute()} />
        ) : null}
        <Button
          label={status === 'ended' || status === 'error' ? 'Back' : 'Hang up'}
          variant={status === 'ended' || status === 'error' ? 'primary' : 'danger'}
          onPress={() => void hangUp()}
        />
      </View>
    </SafeAreaView>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.text },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  name: { fontSize: fontSizes.title + 8, fontWeight: '700', color: colors.surface, textAlign: 'center' },
  status: { fontSize: fontSizes.body, color: colors.border, textAlign: 'center' },
  controls: { padding: spacing.lg, gap: spacing.md },
});
