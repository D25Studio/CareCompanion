import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/**
 * Root layout. Font scaling is capped per <Text> with `maxFontSizeMultiplier={MAX_FONT_SCALE}`
 * rather than through `Text.defaultProps`, which React 19 no longer supports.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </SafeAreaProvider>
  );
}
