import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { readPushData, registerForPushNotifications } from '@/lib/push';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { CircleProvider } from '@/providers/CircleProvider';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CircleProvider>
          <StatusBar style="dark" />
          <PushWiring />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/pair" options={{ title: 'Connect a phone' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
            <Stack.Screen name="call/[requestId]" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="member/[id]" options={{ title: 'Family member' }} />
          </Stack>
        </CircleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** Registers for push once signed in and deep-links when a notification is tapped. */
function PushWiring() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      return;
    }
    void registerForPushNotifications();
  }, [session]);

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse) => {
      const data = readPushData(response);
      if (data.type === 'contact_request' && data.requestId) {
        router.push({ pathname: '/request/[id]', params: { id: data.requestId } });
      } else if (data.type === 'distress' || data.type === 'daily_summary') {
        router.push('/(tabs)/summaries');
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handle(response);
      }
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [router]);

  return null;
}
