import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { MAX_FONT_SCALE, MIN_TOUCH_TARGET, colors, fontSizes, spacing } from '@/theme';

interface BigButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'neutral';
  accessibilityHint?: string;
  style?: ViewStyle;
}

/** The only kind of button the patient ever sees: huge, high contrast, one clear word or two. */
export function BigButton({ label, onPress, variant = 'primary', accessibilityHint, style }: BigButtonProps) {
  const background =
    variant === 'danger' ? colors.danger : variant === 'neutral' ? colors.surface : colors.primary;
  const foreground = variant === 'neutral' ? colors.text : colors.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: variant === 'neutral' ? colors.border : background },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[styles.label, { color: foreground }]}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: fontSizes.button,
    fontWeight: '700',
    textAlign: 'center',
  },
});
