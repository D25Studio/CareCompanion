import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { AgentUiState } from '@/hooks/useCompanionRoom';
import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

interface PulseOrbProps {
  state: AgentUiState;
  connected: boolean;
}

const LABELS: Record<AgentUiState, string> = {
  listening: 'I am listening',
  thinking: 'One moment',
  speaking: 'I am talking',
  idle: 'I am here',
};

/**
 * A single, slow-breathing circle that shows whether the helper is listening or talking.
 * Gentle motion only; it is disabled when the OS asks for reduced motion.
 */
export function PulseOrb({ state, connected }: PulseOrbProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.current = enabled;
    });
  }, []);

  useEffect(() => {
    if (reduceMotion.current || !connected || state === 'idle') {
      scale.setValue(1);
      return;
    }
    const period = state === 'speaking' ? 900 : 1800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: period, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: period, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [connected, scale, state]);

  const color = !connected
    ? colors.border
    : state === 'listening'
      ? colors.listening
      : state === 'speaking'
        ? colors.speaking
        : state === 'thinking'
          ? colors.thinking
          : colors.primary;

  return (
    <View style={styles.container} accessible accessibilityLabel={connected ? LABELS[state] : 'Getting ready'}>
      <Animated.View style={[styles.orb, { backgroundColor: color, transform: [{ scale }] }]} />
      <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {connected ? LABELS[state] : 'Getting ready'}
      </Text>
    </View>
  );
}

const ORB_SIZE = 140;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  label: {
    fontSize: fontSizes.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
