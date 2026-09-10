import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

interface CaptionProps {
  text: string;
  announce?: boolean;
}

/** Shows what the helper just said in very large text, so it can be read as well as heard. */
export function Caption({ text, announce = false }: CaptionProps) {
  useEffect(() => {
    if (announce && text) {
      AccessibilityInfo.announceForAccessibility(text);
    }
  }, [announce, text]);

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Text style={styles.text} maxFontSizeMultiplier={MAX_FONT_SCALE} adjustsFontSizeToFit numberOfLines={6}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: fontSizes.caption,
    lineHeight: fontSizes.caption * 1.35,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
});
