import type { SupabaseClient } from '@supabase/supabase-js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** iOS interruption level / Android channel hint. */
  priority?: 'default' | 'high';
  sound?: 'default' | null;
  channelId?: string;
}

/** Sends the same message to every registered device for the given profiles. */
export async function sendPushToProfiles(
  admin: SupabaseClient,
  profileIds: string[],
  message: PushMessage,
): Promise<{ sent: number; invalidTokens: string[] }> {
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length === 0) {
    return { sent: 0, invalidTokens: [] };
  }

  const { data: tokens, error } = await admin
    .from('push_tokens')
    .select('expo_push_token')
    .in('profile_id', uniqueIds);

  if (error) {
    console.error('push: failed to load tokens', error);
    return { sent: 0, invalidTokens: [] };
  }

  const pushTokens = (tokens ?? []).map((row: { expo_push_token: string }) => row.expo_push_token);
  if (pushTokens.length === 0) {
    return { sent: 0, invalidTokens: [] };
  }

  const payload = pushTokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound === undefined ? 'default' : message.sound,
    priority: message.priority ?? 'high',
    channelId: message.channelId ?? 'default',
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('push: expo returned', response.status, await response.text());
    return { sent: 0, invalidTokens: [] };
  }

  const result = (await response.json()) as {
    data?: Array<{ status: 'ok' | 'error'; details?: { error?: string } }>;
  };

  const invalidTokens: string[] = [];
  (result.data ?? []).forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = pushTokens[index];
      if (token) {
        invalidTokens.push(token);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await admin.from('push_tokens').delete().in('expo_push_token', invalidTokens);
  }

  return { sent: pushTokens.length - invalidTokens.length, invalidTokens };
}
