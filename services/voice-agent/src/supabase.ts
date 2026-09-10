import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database, NotifyRequestPayload } from '@care/shared';

import { getConfig } from './config.ts';

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | null = null;

/** Service-role client shared across jobs in this worker process. */
export function getAdminClient(): AdminClient {
  if (client) {
    return client;
  }
  const config = getConfig();
  client = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

/** Calls the notify-request Edge Function. Failures are logged, never thrown: a missed push must not break the conversation. */
export async function notify(payload: NotifyRequestPayload): Promise<void> {
  const config = getConfig();
  try {
    const response = await fetch(`${config.functionsUrl}/notify-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error('[notify] edge function returned', response.status, await response.text());
    }
  } catch (caught) {
    console.error('[notify] failed to reach edge function', caught);
  }
}
