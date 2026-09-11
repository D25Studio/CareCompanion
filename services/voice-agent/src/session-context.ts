import {
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  DEFAULT_CONDITION_ID,
  DEFAULT_CONTACT_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_SPEAKING_RATE,
  type CareCircleMember,
  type ConditionId,
  type DementiaCondition,
  type DementiaStage,
  type OrientationFacts,
  type PatientSettings,
  type PromptMember,
  type UnavailableResponses,
  orientationFactsSchema,
  unavailableResponsesSchema,
} from '@care/shared';

import type { AdminClient } from './supabase.ts';

export interface CircleMember extends CareCircleMember {
  displayName: string;
}

/** Everything the agent needs to know about one patient, loaded once per session. */
export interface CircleContext {
  circleId: string;
  patientId: string;
  patientPreferredName: string;
  /** Umbrella condition that selects the prompt's `ConditionProfile`. */
  conditionId: ConditionId;
  /** Subtype and stage within that condition, as stored on `patient_settings`. */
  condition: DementiaCondition;
  stage: DementiaStage;
  assistantName: string;
  assistantVoice: string;
  speakingRate: number;
  orientationFacts: OrientationFacts;
  customGuidance: string | null;
  unavailableResponses: UnavailableResponses;
  noAnswerMessage: string | null;
  requestTimeoutSeconds: number;
  storeTranscripts: boolean;
  members: CircleMember[];
}

export async function loadCircleContext(
  admin: AdminClient,
  circleId: string,
  patientId: string,
): Promise<CircleContext> {
  const [{ data: settings, error: settingsError }, { data: members, error: membersError }] = await Promise.all([
    admin.from('patient_settings').select('*').eq('circle_id', circleId).maybeSingle(),
    admin.from('care_circle_members').select('*').eq('circle_id', circleId),
  ]);

  if (settingsError) {
    throw new Error(`Could not load patient settings: ${settingsError.message}`);
  }
  if (membersError) {
    throw new Error(`Could not load circle members: ${membersError.message}`);
  }

  const caregiverIds = (members ?? []).map((member) => member.caregiver_id);
  const { data: profiles } =
    caregiverIds.length > 0
      ? await admin.from('profiles').select('id, display_name').in('id', caregiverIds)
      : { data: [] };
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  return fromRows(circleId, patientId, settings, members ?? [], nameById);
}

/** Builds a safe context even when settings are missing, so the agent can still talk. */
export function fromRows(
  circleId: string,
  patientId: string,
  settings: PatientSettings | null,
  members: CareCircleMember[],
  nameById: Map<string, string>,
): CircleContext {
  const facts = orientationFactsSchema.safeParse(settings?.orientation_facts ?? {});
  const responses = unavailableResponsesSchema.safeParse(settings?.unavailable_responses ?? {});

  return {
    circleId,
    patientId,
    patientPreferredName: settings?.preferred_name?.trim() || 'friend',
    // patient_settings has no primary-condition column yet, so every circle uses the default
    // profile. When one is added, read it here; nothing else in the agent needs to change.
    conditionId: DEFAULT_CONDITION_ID,
    condition: settings?.condition ?? 'unspecified',
    stage: settings?.stage ?? 'unspecified',
    assistantName: settings?.assistant_name?.trim() || DEFAULT_ASSISTANT_NAME,
    assistantVoice: settings?.assistant_voice?.trim() || DEFAULT_ASSISTANT_VOICE,
    speakingRate: Number(settings?.speaking_rate ?? DEFAULT_SPEAKING_RATE),
    orientationFacts: facts.success ? facts.data : {},
    customGuidance: settings?.custom_guidance ?? null,
    unavailableResponses: responses.success ? responses.data : {},
    noAnswerMessage: settings?.no_answer_message ?? null,
    requestTimeoutSeconds: settings?.request_timeout_seconds ?? DEFAULT_CONTACT_REQUEST_TIMEOUT_SECONDS,
    storeTranscripts: settings?.store_transcripts ?? false,
    members: members.map((member) => ({
      ...member,
      displayName: nameById.get(member.caregiver_id)?.trim() || member.relationship_label,
    })),
  };
}

export function toPromptMembers(context: CircleContext): PromptMember[] {
  return context.members.map((member) => ({
    relationshipLabel: member.relationship_label,
    displayName: member.displayName,
    canReceiveCalls: member.can_receive_calls && !isInQuietHours(member, new Date()),
  }));
}

/**
 * Finds the member the patient meant. Matches relationship label first ("wife"),
 * then display name ("Sarah"), case-insensitively and allowing partial words.
 */
export function findMember(context: CircleContext, spoken: string): CircleMember | null {
  const needle = spoken.trim().toLowerCase().replace(/^my\s+/, '');
  if (!needle) {
    return null;
  }

  const byLabel = context.members.find((member) => member.relationship_label.toLowerCase() === needle);
  if (byLabel) {
    return byLabel;
  }
  const byName = context.members.find((member) => member.displayName.toLowerCase() === needle);
  if (byName) {
    return byName;
  }
  const partial = context.members.find(
    (member) =>
      member.relationship_label.toLowerCase().includes(needle) ||
      needle.includes(member.relationship_label.toLowerCase()) ||
      member.displayName.toLowerCase().includes(needle) ||
      needle.includes(member.displayName.toLowerCase()),
  );
  return partial ?? null;
}

/** Quiet hours are stored as local wall-clock times ("22:00:00"); wrap past midnight is supported. */
export function isInQuietHours(member: CareCircleMember, now: Date, timeZone?: string): boolean {
  if (!member.quiet_hours_start || !member.quiet_hours_end) {
    return false;
  }
  const minutesNow = localMinutes(now, timeZone);
  const start = parseMinutes(member.quiet_hours_start);
  const end = parseMinutes(member.quiet_hours_end);
  if (start === null || end === null || start === end) {
    return false;
  }
  if (start < end) {
    return minutesNow >= start && minutesNow < end;
  }
  return minutesNow >= start || minutesNow < end;
}

function parseMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function localMinutes(now: Date, timeZone?: string): number {
  if (!timeZone) {
    return now.getHours() * 60 + now.getMinutes();
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}
