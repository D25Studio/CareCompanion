import dotenv from 'dotenv';
import { z } from 'zod';

import { DEFAULT_CONTACT_REQUEST_TIMEOUT_SECONDS } from '@care/shared';

dotenv.config({ path: '.env.local' });
dotenv.config();

const configSchema = z.object({
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_AGENT_NAME: z.string().min(1).default('care-companion'),

  OPENAI_API_KEY: z.string().min(1),
  REALTIME_MODEL: z.string().min(1).default('gpt-realtime'),
  SUMMARY_MODEL: z.string().min(1).default('gpt-5-mini'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_FUNCTIONS_URL: z.string().url().optional(),

  CONTACT_REQUEST_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(900).default(DEFAULT_CONTACT_REQUEST_TIMEOUT_SECONDS),
  SUMMARY_TIMEZONE: z.string().min(1).default('Australia/Sydney'),
});

export type AgentConfig = z.infer<typeof configSchema> & { functionsUrl: string };

let cached: AgentConfig | null = null;

/**
 * Reads and validates environment configuration once. Fails fast with a readable
 * message listing every missing variable, which is friendlier than a crash later.
 */
export function getConfig(): AgentConfig {
  if (cached) {
    return cached;
  }
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Voice agent configuration is incomplete. Fix these in services/voice-agent/.env.local:\n${problems}`);
  }
  cached = {
    ...parsed.data,
    functionsUrl: parsed.data.SUPABASE_FUNCTIONS_URL ?? `${parsed.data.SUPABASE_URL}/functions/v1`,
  };
  return cached;
}
