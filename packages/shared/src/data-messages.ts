import { z } from 'zod';

/**
 * Messages sent over the LiveKit data channel between the voice agent and the
 * Companion (patient) app. All messages are JSON on topic DATA_TOPIC.
 *
 * Agent -> Companion: drive the single-screen UI (captions, call screen).
 * Companion -> Agent: minimal signals (patient pressed hang up).
 */

export const agentToCompanionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent_ready'),
    assistantName: z.string(),
  }),
  z.object({
    type: z.literal('caption'),
    text: z.string(),
    final: z.boolean(),
  }),
  z.object({
    type: z.literal('agent_state'),
    state: z.enum(['listening', 'thinking', 'speaking', 'idle']),
  }),
  z.object({
    type: z.literal('contact_request_status'),
    requestId: z.string(),
    status: z.enum(['pending', 'accepted', 'declined', 'expired', 'connected', 'ended']),
    contactName: z.string(),
  }),
  z.object({
    type: z.literal('call_started'),
    requestId: z.string(),
    contactName: z.string(),
    contactIdentity: z.string(),
  }),
  z.object({
    type: z.literal('call_ended'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('session_ending'),
    reason: z.enum(['patient_request', 'idle', 'error']),
  }),
]);
export type AgentToCompanionMessage = z.infer<typeof agentToCompanionMessageSchema>;

export const companionToAgentMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hang_up'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('talk_button_pressed'),
  }),
]);
export type CompanionToAgentMessage = z.infer<typeof companionToAgentMessageSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeDataMessage(message: AgentToCompanionMessage | CompanionToAgentMessage): Uint8Array<ArrayBuffer> {
  // LiveKit's publishData wants a Uint8Array backed by a plain ArrayBuffer.
  return encoder.encode(JSON.stringify(message)) as Uint8Array<ArrayBuffer>;
}

export function decodeAgentMessage(payload: Uint8Array): AgentToCompanionMessage | null {
  const parsed = agentToCompanionMessageSchema.safeParse(safeJsonParse(decoder.decode(payload)));
  return parsed.success ? parsed.data : null;
}

export function decodeCompanionMessage(payload: Uint8Array): CompanionToAgentMessage | null {
  const parsed = companionToAgentMessageSchema.safeParse(safeJsonParse(decoder.decode(payload)));
  return parsed.success ? parsed.data : null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
