/**
 * Shared constants used by the patient app, caregiver app, voice agent and Edge Functions.
 * Keep enum-like values here in sync with the Postgres enums in supabase/migrations.
 */

export const PROFILE_ROLES = ['patient', 'caregiver'] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

/**
 * Umbrella conditions the companion knows how to talk with. Each id has a matching
 * `ConditionProfile` in `packages/shared/src/prompts/` that supplies the condition-specific
 * parts of the system prompt. To support another condition: add its id here, write a profile,
 * and register it in `condition-profiles.ts`. The universal parts of the prompt (manner,
 * keeping calm, safety, family contact) apply to every condition and live in `companion-core.ts`.
 */
export const CONDITION_IDS = ['dementia'] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

/** Used until `patient_settings` carries a primary-condition column of its own. */
export const DEFAULT_CONDITION_ID: ConditionId = 'dementia';

export const CONDITION_LABELS: Record<ConditionId, string> = {
  dementia: 'Dementia',
};

/**
 * Subtypes of dementia. Stored in `patient_settings.condition` (Postgres enum `dementia_condition`).
 * Each subtype has behavioural guidance in the dementia `ConditionProfile`.
 */
export const DEMENTIA_CONDITIONS = [
  'alzheimers',
  'vascular',
  'lewy_body',
  'frontotemporal',
  'mixed',
  'unspecified',
] as const;
export type DementiaCondition = (typeof DEMENTIA_CONDITIONS)[number];

export const DEMENTIA_CONDITION_LABELS: Record<DementiaCondition, string> = {
  alzheimers: "Alzheimer's disease",
  vascular: 'Vascular dementia',
  lewy_body: 'Lewy body dementia',
  frontotemporal: 'Frontotemporal dementia',
  mixed: 'Mixed dementia',
  unspecified: 'Not specified',
};

export const DEMENTIA_STAGES = ['early', 'middle', 'late', 'unspecified'] as const;
export type DementiaStage = (typeof DEMENTIA_STAGES)[number];

export const DEMENTIA_STAGE_LABELS: Record<DementiaStage, string> = {
  early: 'Early stage',
  middle: 'Middle stage',
  late: 'Late stage',
  unspecified: 'Not specified',
};

export const CONTACT_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'connected',
  'ended',
] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

export const CONVERSATION_EVENT_TYPES = [
  'user_said',
  'assistant_said',
  'tool_call',
  'escalation',
  'session_note',
] as const;
export type ConversationEventType = (typeof CONVERSATION_EVENT_TYPES)[number];

export const DISTRESS_LEVELS = ['low', 'medium', 'high'] as const;
export type DistressLevel = (typeof DISTRESS_LEVELS)[number];

/**
 * Reasons a caregiver can pick with one tap when they cannot take a call.
 * `defaultMessage` is what the assistant speaks unless the owner has customised it.
 * Placeholders: {name} = caregiver display name, {patient} = patient preferred name.
 */
export const UNAVAILABLE_REASONS = {
  at_work: {
    label: 'At work',
    defaultMessage: '{name} is at work right now. {name} will call you as soon as work is finished.',
  },
  driving: {
    label: 'Driving',
    defaultMessage: '{name} is driving at the moment and will call you very soon.',
  },
  sleeping: {
    label: 'Sleeping',
    defaultMessage: '{name} is resting right now. {name} will call you when they wake up.',
  },
  in_a_meeting: {
    label: 'In a meeting',
    defaultMessage: '{name} is in a meeting and will call you back shortly.',
  },
  call_back_soon: {
    label: 'Will call back soon',
    defaultMessage: '{name} got your message and will call you back very soon.',
  },
  other: {
    label: 'Other',
    defaultMessage: '{name} cannot talk right now, but knows you were thinking of them and will call you later.',
  },
} as const;
export type UnavailableReasonKey = keyof typeof UNAVAILABLE_REASONS;
export const UNAVAILABLE_REASON_KEYS = Object.keys(UNAVAILABLE_REASONS) as UnavailableReasonKey[];

/** Spoken when nobody answers the request before the timeout. Same placeholders as above. */
export const DEFAULT_NO_ANSWER_MESSAGE =
  '{name} has not been able to answer just yet. I have let {name} know you would like to talk, and they will call you as soon as they can.';

export const DEFAULT_CONTACT_REQUEST_TIMEOUT_SECONDS = 90;
export const MIN_CONTACT_REQUEST_TIMEOUT_SECONDS = 30;
export const MAX_CONTACT_REQUEST_TIMEOUT_SECONDS = 600;

export const DEFAULT_ASSISTANT_NAME = 'Companion';
export const DEFAULT_ASSISTANT_VOICE = 'marin';
export const DEFAULT_SPEAKING_RATE = 0.9;

export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_TTL_MINUTES = 30;

/** LiveKit room and identity conventions. */
export const ROOM_NAME_PREFIX = 'circle-';
export const IDENTITY_PREFIX = {
  patient: 'patient:',
  caregiver: 'caregiver:',
} as const;

/** Data-channel topic used for agent <-> companion app messages. */
export const DATA_TOPIC = 'care-companion';

export function roomNameForCircle(circleId: string): string {
  return `${ROOM_NAME_PREFIX}${circleId}`;
}

export function circleIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(ROOM_NAME_PREFIX)) {
    return null;
  }
  return roomName.slice(ROOM_NAME_PREFIX.length);
}

export function patientIdentity(profileId: string): string {
  return `${IDENTITY_PREFIX.patient}${profileId}`;
}

export function caregiverIdentity(profileId: string): string {
  return `${IDENTITY_PREFIX.caregiver}${profileId}`;
}

export function isCaregiverIdentity(identity: string): boolean {
  return identity.startsWith(IDENTITY_PREFIX.caregiver);
}

export function isPatientIdentity(identity: string): boolean {
  return identity.startsWith(IDENTITY_PREFIX.patient);
}

/** Replace {name} / {patient} placeholders in caregiver-authored messages. */
export function fillMessageTemplate(
  template: string,
  values: { name: string; patient: string },
): string {
  return template.replaceAll('{name}', values.name).replaceAll('{patient}', values.patient);
}
