import { type LivekitTokenResponse, livekitTokenResponseSchema } from '@care/shared';

import { supabase } from './supabase';

export class NotPairedError extends Error {
  constructor() {
    super('This phone has not been set up by a family member yet.');
    this.name = 'NotPairedError';
  }
}

/** Asks the livekit-token Edge Function for a patient token; the agent is dispatched to the room. */
export async function fetchPatientConnection(circleId: string): Promise<LivekitTokenResponse> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { role: 'patient', circleId },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && context.status === 409) {
      throw new NotPairedError();
    }
    throw new Error(`Could not connect: ${error.message}`);
  }

  const parsed = livekitTokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Could not connect: unexpected response from the server.');
  }
  return parsed.data;
}
