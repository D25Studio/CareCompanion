import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireEnv } from './http.ts';

/** Service-role client. Bypasses RLS; use only in trusted server code. */
export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client scoped to the calling user's JWT so RLS applies. */
export function createUserClient(request: Request): SupabaseClient {
  const authHeader = request.headers.get('Authorization') ?? '';
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getCallingUserId(request: Request): Promise<string | null> {
  const client = createUserClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}
