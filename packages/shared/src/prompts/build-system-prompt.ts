import { DEFAULT_ASSISTANT_NAME, DEFAULT_CONDITION_ID, type ConditionId } from '../constants';
import type { OrientationFacts } from '../schemas';
import {
  HOW_YOU_COME_ACROSS,
  KEEPING_CALM,
  SAFETY,
  WHAT_YOU_MUST_NOT_DO,
  WHEN_THEY_ASK_FOR_SOMEONE,
} from './companion-core';
import { type ConditionProfile, resolveGuidance } from './condition-profile';
import { getConditionProfile } from './condition-profiles';

/** Bump when the prompt structure or wording changes so logged sessions can be compared. */
export const PROMPT_VERSION = '2026-09-11.2';

/** Used when the caregiver has not set a preferred name. Deliberately not a pet name. */
const FALLBACK_PATIENT_NAME = 'friend';

export interface PromptMember {
  relationshipLabel: string;
  displayName: string;
  canReceiveCalls: boolean;
}

export interface PromptContext {
  patientPreferredName: string;
  /** Umbrella condition; selects the `ConditionProfile`. Defaults to `DEFAULT_CONDITION_ID`. */
  conditionId?: ConditionId;
  /** Subtype within the condition, as stored in `patient_settings.condition`. Unknown values fall back to "unspecified". */
  condition: string;
  /** Stage within the condition, as stored in `patient_settings.stage`. Unknown values fall back to "unspecified". */
  stage: string;
  assistantName?: string;
  orientationFacts: OrientationFacts;
  customGuidance: string | null;
  members: PromptMember[];
  /** Current local time for the patient, already formatted (e.g. "Tuesday 9 September, 9:30 in the morning"). */
  localTimeDescription: string;
}

interface PromptNames {
  assistantName: string;
  patientName: string;
}

/**
 * Builds the full system prompt for a voice session.
 *
 * Section order is deliberate and the model is sensitive to it:
 *  1. Identity: who the companion is and what it is for.
 *  2. How it comes across: universal anti-patronising rules. First, because tone is the thing
 *     people react to before anything else, and the condition rules below must be read through it.
 *  3. Condition profile: communication rules, then subtype, then stage adjustments.
 *  4. Keeping calm: universal de-escalation plus the condition's own additions.
 *  5. Boundaries, reaching family, safety (universal plus the condition's additions).
 *  6. Session data: facts, people, caregiver guidance (explicitly subordinate), tools.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const names: PromptNames = {
    assistantName: context.assistantName?.trim() || DEFAULT_ASSISTANT_NAME,
    patientName: context.patientPreferredName.trim() || FALLBACK_PATIENT_NAME,
  };
  const profile = getConditionProfile(context.conditionId ?? DEFAULT_CONDITION_ID);

  const sections: string[] = [
    formatIdentity(profile),
    HOW_YOU_COME_ACROSS,
    profile.communicationRules,
    resolveGuidance(profile.subtypeGuidance, context.condition),
    resolveGuidance(profile.stageGuidance, context.stage),
    appendAddition(KEEPING_CALM, profile.calmingGuidance),
    WHAT_YOU_MUST_NOT_DO,
    WHEN_THEY_ASK_FOR_SOMEONE,
    appendAddition(SAFETY, profile.safetyGuidance),
    formatOrientation(context.localTimeDescription, context.orientationFacts),
    formatMembers(context.members),
  ];

  if (context.customGuidance && context.customGuidance.trim().length > 0) {
    sections.push(
      `GUIDANCE FROM {PATIENT}'S FAMILY\n` +
        `Follow this where it does not conflict with the rules above. If it conflicts, the rules above win.\n` +
        context.customGuidance.trim(),
    );
  }

  sections.push(
    `TOOLS\n` +
      `- request_contact: use when {patient} wants to speak to a family member. Pass the relationship word they used (for example "wife", "son", "Sarah").\n` +
      `- get_orientation_info: use when they ask the time, day, date, where they are, or who is coming today.\n` +
      `- flag_distress: use for safety concerns as described above. This quietly alerts family; do not describe the tool to {patient}.\n` +
      `- end_conversation: use only when {patient} clearly says goodbye or asks you to stop. Say a short, plain goodbye first.`,
  );

  return fillPromptTemplate(sections.filter((section) => section.length > 0).join('\n\n'), names);
}

function formatIdentity(profile: ConditionProfile): string {
  return (
    `You are {assistant}, a voice companion on {patient}'s phone. {patient} ${profile.personDescription}. ` +
    `You are here to keep {patient} company, to help them feel settled when something is bothering them, ` +
    `and to help them reach their family through this app when they want to. ` +
    `You are speaking out loud in a live conversation; everything you say is heard, not read.`
  );
}

/** Joins a universal section with a profile's optional additions, skipping the join when there are none. */
function appendAddition(section: string, addition: string): string {
  const trimmed = addition.trim();
  return trimmed.length > 0 ? `${section}\n${trimmed}` : section;
}

/**
 * Replaces the `{patient}`, `{PATIENT}` and `{assistant}` placeholders used throughout the
 * prompt text. Applied once to the assembled prompt so profile authors can write plain strings.
 */
function fillPromptTemplate(text: string, names: PromptNames): string {
  return text
    .replaceAll('{PATIENT}', names.patientName.toUpperCase())
    .replaceAll('{patient}', names.patientName)
    .replaceAll('{assistant}', names.assistantName);
}

function formatOrientation(localTimeDescription: string, facts: OrientationFacts): string {
  const lines = ['FACTS YOU MAY SHARE WITH {PATIENT}', `- Right now it is ${localTimeDescription}.`];
  for (const [key, value] of Object.entries(facts)) {
    lines.push(`- ${humaniseKey(key)}: ${value}`);
  }
  lines.push(
    'Share these plainly when asked. Do not volunteer them all at once. If asked something you do not know, say so simply and offer to let family know.',
  );
  return lines.join('\n');
}

function formatMembers(members: PromptMember[]): string {
  if (members.length === 0) {
    return (
      'PEOPLE {PATIENT} CAN REACH\n' +
      'No family members are set up yet. If they ask to call someone, say plainly that you will let their family know, and use flag_distress with level "low" and a note about who they asked for.'
    );
  }
  const lines = ['PEOPLE {PATIENT} CAN REACH THROUGH YOU'];
  for (const member of members) {
    const availability = member.canReceiveCalls ? 'can be contacted' : 'cannot be called right now, but you can still let them know';
    lines.push(`- ${member.displayName}, their ${member.relationshipLabel} (${availability})`);
  }
  lines.push(
    'When {patient} asks for one of these people by relationship or name, use request_contact. If they ask for someone not on this list, say plainly that you can let their family know, and use flag_distress with level "low" and a note naming who they asked for.',
  );
  return lines.join('\n');
}

function humaniseKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * Formats a Date for speech in the patient's time zone, e.g.
 * "Wednesday 9 September, half past nine in the morning".
 */
export function describeLocalTime(now: Date, timeZone: string): string {
  const dateFormatter = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  });
  const hourFormatter = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone,
  });

  const dateText = dateFormatter.format(now);
  const parts = hourFormatter.formatToParts(now);
  const hour24 = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return `${dateText}, ${describeClockTime(hour24, minute)}`;
}

function describeClockTime(hour24: number, minute: number): string {
  const period = hour24 < 12 ? 'in the morning' : hour24 < 17 ? 'in the afternoon' : hour24 < 21 ? 'in the evening' : 'at night';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const nextHour12 = (hour24 + 1) % 12 === 0 ? 12 : (hour24 + 1) % 12;

  if (minute === 0) {
    return `${hour12} o'clock ${period}`;
  }
  if (minute === 15) {
    return `quarter past ${hour12} ${period}`;
  }
  if (minute === 30) {
    return `half past ${hour12} ${period}`;
  }
  if (minute === 45) {
    return `quarter to ${nextHour12} ${period}`;
  }
  return `${hour12} ${String(minute).padStart(2, '0')} ${period}`;
}
