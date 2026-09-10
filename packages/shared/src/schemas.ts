import { z } from 'zod';

import {
  DEMENTIA_CONDITIONS,
  DEMENTIA_STAGES,
  DISTRESS_LEVELS,
  MAX_CONTACT_REQUEST_TIMEOUT_SECONDS,
  MIN_CONTACT_REQUEST_TIMEOUT_SECONDS,
  UNAVAILABLE_REASON_KEYS,
} from './constants';

/** Caregiver-supplied facts the assistant may use to orient the patient. */
export const orientationFactsSchema = z.record(z.string().min(1).max(60), z.string().min(1).max(300));
export type OrientationFacts = z.infer<typeof orientationFactsSchema>;

/** reason_key -> spoken message. Only known reason keys are accepted. */
export const unavailableResponsesSchema = z.record(
  z.enum(UNAVAILABLE_REASON_KEYS as [string, ...string[]]),
  z.string().min(1).max(400),
);
export type UnavailableResponses = z.infer<typeof unavailableResponsesSchema>;

export const patientSettingsUpdateSchema = z.object({
  preferred_name: z.string().trim().min(1).max(60),
  condition: z.enum(DEMENTIA_CONDITIONS),
  stage: z.enum(DEMENTIA_STAGES),
  assistant_name: z.string().trim().min(1).max(40),
  assistant_voice: z.string().trim().min(1).max(40),
  speaking_rate: z.number().min(0.5).max(1.2),
  orientation_facts: orientationFactsSchema,
  custom_guidance: z.string().max(2000).nullable(),
  unavailable_responses: unavailableResponsesSchema,
  no_answer_message: z.string().max(400).nullable(),
  request_timeout_seconds: z
    .number()
    .int()
    .min(MIN_CONTACT_REQUEST_TIMEOUT_SECONDS)
    .max(MAX_CONTACT_REQUEST_TIMEOUT_SECONDS),
  store_transcripts: z.boolean(),
});
export type PatientSettingsUpdate = z.infer<typeof patientSettingsUpdateSchema>;

export const memberUpdateSchema = z.object({
  relationship_label: z.string().trim().min(1).max(40),
  can_receive_calls: z.boolean(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
});
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

/** Payloads accepted by the notify-request Edge Function. */
export const notifyRequestPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('contact_request'),
    requestId: z.uuid(),
  }),
  z.object({
    type: z.literal('distress'),
    circleId: z.uuid(),
    sessionId: z.uuid().nullable(),
    level: z.enum(DISTRESS_LEVELS),
    note: z.string().max(1000),
  }),
  z.object({
    type: z.literal('daily_summary'),
    circleId: z.uuid(),
    summaryId: z.uuid(),
  }),
]);
export type NotifyRequestPayload = z.infer<typeof notifyRequestPayloadSchema>;

/** Payload accepted by the livekit-token Edge Function. */
export const livekitTokenRequestSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('patient'),
    circleId: z.uuid(),
  }),
  z.object({
    role: z.literal('caregiver'),
    circleId: z.uuid(),
    requestId: z.uuid(),
  }),
]);
export type LivekitTokenRequest = z.infer<typeof livekitTokenRequestSchema>;

export const livekitTokenResponseSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  roomName: z.string().min(1),
  identity: z.string().min(1),
});
export type LivekitTokenResponse = z.infer<typeof livekitTokenResponseSchema>;
