import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/BigButton';
import type { PairingCode } from '@/lib/patient-session';
import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

interface PairingScreenProps {
  pairing: PairingCode;
  /** True when the phone is already paired and a family member asked for a code to add someone. */
  alreadyPaired?: boolean;
  onCancel?: () => void;
}

/**
 * Shown once, while a family member sets the phone up from their own Caregiver app.
 * Written for the family member, who is holding the patient's phone at this point.
 */
export function PairingScreen({ pairing, alreadyPaired = false, onCancel }: PairingScreenProps) {
  const spacedCode = pairing.code.split('').join(' ');

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {alreadyPaired ? 'Add a family member' : 'Almost ready'}
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Family member: open the Caregiver app on your own phone and enter this code.
        </Text>
        <Text
          style={styles.code}
          accessibilityLabel={`Pairing code ${pairing.code.split('').join(', ')}`}
          maxFontSizeMultiplier={1.0}
        >
          {spacedCode}
        </Text>
        <Text style={styles.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          This code refreshes automatically. This screen will change on its own once you are done.
        </Text>
      </View>
      {alreadyPaired && onCancel ? (
        <View style={styles.footer}>
          <BigButton label="Back" variant="neutral" onPress={onCancel} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSizes.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: fontSizes.small * 1.4,
  },
  code: {
    fontSize: fontSizes.code,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: spacing.md,
  },
  small: {
    fontSize: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
  },
});
