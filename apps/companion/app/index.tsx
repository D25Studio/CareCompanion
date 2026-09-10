import { useKeepAwake } from 'expo-keep-awake';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/BigButton';
import { usePatientBootstrap } from '@/hooks/usePatientBootstrap';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { PairingScreen } from '@/screens/PairingScreen';
import { MAX_FONT_SCALE, colors, fontSizes, spacing } from '@/theme';

export default function Index() {
  // The phone must never lock mid-conversation; the patient may not know how to unlock it.
  useKeepAwake();
  const { state, retry, showNewPairingCode, cancelPairing } = usePatientBootstrap();

  switch (state.kind) {
    case 'loading':
      return (
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            One moment
          </Text>
        </SafeAreaView>
      );
    case 'needs_pairing':
      return <PairingScreen pairing={state.pairing} alreadyPaired={state.alreadyPaired} onCancel={cancelPairing} />;
    case 'ready':
      return <ConversationScreen circleId={state.circleId} onRequestPairingCode={showNewPairingCode} />;
    case 'error':
      return (
        <SafeAreaView style={styles.centered}>
          <Text style={styles.text} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Something needs fixing. A family member can help.
          </Text>
          <Text style={styles.detail} maxFontSizeMultiplier={MAX_FONT_SCALE} selectable>
            {state.message}
          </Text>
          <View style={styles.button}>
            <BigButton label="Try again" onPress={retry} />
          </View>
        </SafeAreaView>
      );
  }
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  text: {
    fontSize: fontSizes.caption,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  detail: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
});
