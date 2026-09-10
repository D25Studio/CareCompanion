import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/BigButton';
import { Caption } from '@/components/Caption';
import { PulseOrb } from '@/components/PulseOrb';
import { useCompanionRoom } from '@/hooks/useCompanionRoom';
import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

import { CallScreen } from './CallScreen';

interface ConversationScreenProps {
  circleId: string;
  /** Hidden family gesture: press and hold the helper's name for five seconds. */
  onRequestPairingCode: () => void;
}

const FAMILY_LONG_PRESS_MS = 5000;

/**
 * The patient's one and only screen. The helper listens all the time; the patient can
 * simply talk. Captions show what was said. There is nothing to navigate.
 */
export function ConversationScreen({ circleId, onRequestPairingCode }: ConversationScreenProps) {
  const room = useCompanionRoom(circleId);

  if (room.call) {
    return <CallScreen contactName={room.call.contactName} onHangUp={room.hangUp} />;
  }

  const connected = room.status === 'connected';
  const headline = connected ? room.assistantName : statusHeadline(room.status);
  const captionText = connected
    ? room.caption || `Hello. I am ${room.assistantName}. You can just talk to me.`
    : statusCaption(room.status);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onLongPress={onRequestPairingCode}
          delayLongPress={FAMILY_LONG_PRESS_MS}
          accessibilityRole="header"
          accessibilityLabel={headline}
          accessibilityHint="Family members: press and hold for five seconds to add another caregiver"
        >
          <Text style={styles.headline} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {headline}
          </Text>
        </Pressable>
        {room.pendingContact ? (
          <Text style={styles.pending} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite">
            {room.pendingContact.status === 'accepted'
              ? `${room.pendingContact.contactName} is coming on the line`
              : `Letting ${room.pendingContact.contactName} know`}
          </Text>
        ) : null}
      </View>

      <Caption text={captionText} announce={!connected} />

      <View style={styles.footer}>
        <PulseOrb state={room.agentState} connected={connected} />
        {room.status === 'error' || room.status === 'ended' || room.status === 'not_paired' ? (
          <BigButton label="Talk to me" onPress={room.retry} accessibilityHint="Starts the helper again" />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function statusHeadline(status: ReturnType<typeof useCompanionRoom>['status']): string {
  switch (status) {
    case 'connecting':
      return 'One moment';
    case 'reconnecting':
      return 'One moment';
    case 'not_paired':
      return 'Almost ready';
    case 'ended':
      return 'Goodbye for now';
    case 'error':
    default:
      return 'Just a moment';
  }
}

function statusCaption(status: ReturnType<typeof useCompanionRoom>['status']): string {
  switch (status) {
    case 'connecting':
      return 'Getting ready to talk with you.';
    case 'reconnecting':
      return 'I am still here. Just a moment.';
    case 'not_paired':
      return 'A family member is finishing the set-up of this phone.';
    case 'ended':
      return 'Press the button whenever you would like to talk.';
    case 'error':
    default:
      return 'I am having a little trouble hearing right now. I will keep trying.';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  headline: {
    fontSize: fontSizes.title,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  pending: {
    fontSize: fontSizes.small,
    color: colors.accent,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },
});
