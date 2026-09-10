import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/BigButton';
import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

interface CallScreenProps {
  contactName: string;
  onHangUp: () => void;
}

/** During a family call: who they are talking to, and one way to stop. Nothing else. */
export function CallScreen({ contactName, onHangUp }: CallScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.avatarLetter} maxFontSizeMultiplier={1.0}>
            {contactName.trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.name} maxFontSizeMultiplier={MAX_FONT_SCALE} adjustsFontSizeToFit numberOfLines={2}>
          {contactName}
        </Text>
        <Text style={styles.status} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          is on the phone with you
        </Text>
      </View>
      <View style={styles.footer}>
        <BigButton
          label="Hang up"
          variant="danger"
          onPress={onHangUp}
          accessibilityHint={`Ends the call with ${contactName}`}
        />
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 180;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 96,
    fontWeight: '800',
    color: colors.primaryText,
  },
  name: {
    fontSize: fontSizes.title + 8,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  status: {
    fontSize: fontSizes.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
  },
});
