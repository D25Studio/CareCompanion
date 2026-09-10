import type { RealtimeChannel } from '@supabase/supabase-js';

import type { CareCircle } from '@care/shared';

import { supabase } from './supabase';

/**
 * The patient never types a password. The device signs in anonymously once and the
 * session is persisted; the auth trigger creates a `patient` profile.
 */
export async function ensurePatientUser(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) {
    return existing.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { role: 'patient', display_name: 'Patient' } },
  });
  if (error || !data.user) {
    throw new Error(
      `Could not start the app: ${error?.message ?? 'no user returned'}. Anonymous sign-ins must be enabled in Supabase Auth settings.`,
    );
  }
  return data.user.id;
}

export async function getOwnCircle(): Promise<CareCircle | null> {
  const { data, error } = await supabase.from('care_circles').select('*').maybeSingle();
  if (error) {
    throw new Error(`Could not load your care circle: ${error.message}`);
  }
  return data;
}

export interface PairingCode {
  circleId: string;
  code: string;
  expiresAt: Date;
}

export async function requestPairingCode(): Promise<PairingCode> {
  const { data, error } = await supabase.rpc('create_pairing_code');
  if (error || !data || data.length === 0) {
    throw new Error(`Could not create a pairing code: ${error?.message ?? 'empty response'}`);
  }
  const row = data[0]!;
  return { circleId: row.circle_id, code: row.pairing_code, expiresAt: new Date(row.expires_at) };
}

/** Resolves when a caregiver has redeemed the pairing code (owner set and code cleared). */
export function watchForPairing(circleId: string, onPaired: () => void): () => void {
  const isPaired = (row: Pick<CareCircle, 'owner_id' | 'pairing_code'>) => Boolean(row.owner_id) && row.pairing_code === null;

  let channel: RealtimeChannel | null = supabase
    .channel(`pairing-${circleId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'care_circles', filter: `id=eq.${circleId}` },
      (payload) => {
        if (isPaired(payload.new as CareCircle)) {
          onPaired();
        }
      },
    )
    .subscribe();

  // Polling fallback: realtime can be blocked on some networks.
  const poll = setInterval(async () => {
    const { data } = await supabase.from('care_circles').select('owner_id, pairing_code').eq('id', circleId).maybeSingle();
    if (data && isPaired(data)) {
      onPaired();
    }
  }, 5000);

  return () => {
    clearInterval(poll);
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
