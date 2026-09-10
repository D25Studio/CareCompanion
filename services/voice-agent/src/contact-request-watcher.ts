import type { RealtimeChannel } from '@supabase/supabase-js';

import { type ContactRequest, isResolvedForAgent } from '@care/shared';

import type { AdminClient } from './supabase.ts';

const POLL_INTERVAL_MS = 5_000;

/**
 * Waits for a contact request to leave the `pending` state.
 *
 * Uses Supabase Realtime for immediacy and a slow poll as a safety net, so a dropped
 * websocket never leaves the patient waiting past the timeout.
 */
export async function waitForRequestResolution(
  admin: AdminClient,
  requestId: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ContactRequest | null> {
  let channel: RealtimeChannel | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;

  const cleanup = async () => {
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    if (channel) {
      await admin.removeChannel(channel).catch(() => undefined);
    }
  };

  const result = await new Promise<ContactRequest | null>((resolve) => {
    let settled = false;
    const settle = (value: ContactRequest | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    channel = admin
      .channel(`contact-request-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contact_requests', filter: `id=eq.${requestId}` },
        (payload) => {
          const row = payload.new as ContactRequest;
          if (isResolvedForAgent(row.status)) {
            settle(row);
          }
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[request-watcher] realtime unavailable, relying on polling', status, error?.message);
        }
      });

    const poll = async () => {
      const { data } = await admin.from('contact_requests').select('*').eq('id', requestId).maybeSingle();
      if (data && isResolvedForAgent(data.status)) {
        settle(data);
      }
    };
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();

    timeoutTimer = setTimeout(() => settle(null), timeoutMs);

    signal?.addEventListener('abort', () => settle(null), { once: true });
  });

  await cleanup();
  return result;
}
