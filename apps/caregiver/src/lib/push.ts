import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android channels match the `channelId` values used by the notify-request Edge Function. */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('contact-requests', {
    name: 'Contact requests',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('urgent-alerts', {
    name: 'Urgent alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 200, 600, 200, 600],
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('alerts', {
    name: 'Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('summaries', {
    name: 'Daily summaries',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Asks for permission, gets an Expo push token and stores it against the signed-in profile.
 * Returns null on simulators or when permission is denied; the app keeps working via realtime.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }
  await ensureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId || undefined;

  try {
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) {
      console.warn('push: could not store token', error.message);
    }
    return token;
  } catch (caught) {
    console.warn('push: could not get token', caught);
    return null;
  }
}

export interface PushData {
  type?: 'contact_request' | 'distress' | 'daily_summary';
  requestId?: string;
  circleId?: string;
  summaryId?: string;
}

export function readPushData(response: Notifications.NotificationResponse): PushData {
  return (response.notification.request.content.data ?? {}) as PushData;
}
