import { type LivekitTokenResponse, livekitTokenResponseSchema } from '@care/shared';

import { supabase } from './supabase';

/** Gets a LiveKit token to join the patient's room for an accepted request. */
export async function fetchCaregiverConnection(circleId: string, requestId: string): Promise<LivekitTokenResponse> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { role: 'caregiver', circleId, requestId },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail = error.message;
    if (context) {
      try {
        const body = (await context.json()) as { error?: string };
        detail = body.error ?? detail;
      } catch {
        // Keep the generic message.
      }
    }
    throw new Error(detail);
  }
  const parsed = livekitTokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Unexpected response from the server.');
  }
  return parsed.data;
}

export async function respondToRequest(
  requestId: string,
  action: 'accept' | 'decline',
  reasonKey?: string | null,
  message?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('respond_to_contact_request', {
    p_request_id: requestId,
    p_action: action,
    p_reason_key: reasonKey ?? null,
    p_message: message ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export function friendlyError(caught: unknown): string {
  if (caught instanceof Error) {
    return caught.message;
  }
  return String(caught);
}
