import {
  DEFAULT_ASSISTANT_NAME,
  type DementiaCondition,
  type DementiaStage,
} from '../constants';
import type { OrientationFacts } from '../schemas';
import { CONDITION_GUIDANCE, STAGE_GUIDANCE } from './conditions';
import { DEMENTIA_COMMUNICATION_RULES } from './dementia-communication';

/** Bump when the prompt structure changes so logged sessions can be compared. */
export const PROMPT_VERSION = '2026-09-09.1';

export interface PromptMember {
  relationshipLabel: string;
  displayName: string;
  canReceiveCalls: boolean;
}

export interface PromptContext {
  patientPreferredName: string;
  condition: DementiaCondition;
  stage: DementiaStage;
  assistantName?: string;
  orientationFacts: OrientationFacts;
  customGuidance: string | null;
  members: PromptMember[];
  /** Current local time for the patient, already formatted (e.g. "Tuesday 9 September, 9:30 in the morning"). */
  localTimeDescription: string;
}

/**
 * Builds the full system prompt for a voice session.
 *
 * Ordering matters for the model: identity, fixed rules, condition and stage adjustments,
 * then caregiver-supplied facts and guidance, then the people they can reach.
 * Caregiver guidance comes last but is explicitly subordinate to the fixed rules.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const assistantName = context.assistantName?.trim() || DEFAULT_ASSISTANT_NAME;
  const patientName = context.patientPreferredName.trim() || 'friend';

  const sections: string[] = [];

  sections.push(
    `You are ${assistantName}, a gentle voice helper on the phone of ${patientName}, who is living with dementia. ` +
      `Your purpose is to keep ${patientName} calm and comfortable, help them reach their family through this app, and keep them company. ` +
      `You are speaking out loud; everything you say will be heard, not read.`,
  );

  sections.push(DEMENTIA_COMMUNICATION_RULES);
  sections.push(CONDITION_GUIDANCE[context.condition]);
  sections.push(STAGE_GUIDANCE[context.stage]);

  sections.push(formatOrientation(patientName, context.localTimeDescription, context.orientationFacts));
  sections.push(formatMembers(patientName, context.members));

  if (context.customGuidance && context.customGuidance.trim().length > 0) {
    sections.push(
      `GUIDANCE FROM ${patientName.toUpperCase()}'S FAMILY\n` +
        `Follow this where it does not conflict with the rules above. If it conflicts, the rules above win.\n` +
        context.customGuidance.trim(),
    );
  }

  sections.push(
    `TOOLS\n` +
      `- request_contact: use when ${patientName} wants to speak to a family member. Pass the relationship word they used (for example "wife", "son", "Sarah").\n` +
      `- get_orientation_info: use when they ask the time, day, date, where they are, or who is coming today.\n` +
      `- flag_distress: use for safety concerns as described above. This quietly alerts family; do not describe the tool to ${patientName}.\n` +
      `- end_conversation: use only when ${patientName} clearly says goodbye or asks you to stop. Say a short warm goodbye first.`,
  );

  return sections.join('\n\n');
}

function formatOrientation(
  patientName: string,
  localTimeDescription: string,
  facts: OrientationFacts,
): string {
  const lines = [`FACTS YOU MAY SHARE WITH ${patientName.toUpperCase()}`, `- Right now it is ${localTimeDescription}.`];
  for (const [key, value] of Object.entries(facts)) {
    lines.push(`- ${humaniseKey(key)}: ${value}`);
  }
  lines.push('Share these plainly when asked. Do not volunteer them all at once. If asked something you do not know, say so simply and offer to let family know.');
  return lines.join('\n');
}

function formatMembers(patientName: string, members: PromptMember[]): string {
  if (members.length === 0) {
    return `PEOPLE ${patientName.toUpperCase()} CAN REACH\nNo family members are set up yet. If they ask to call someone, say kindly that you will let their family know, and use flag_distress with level "low" and a note about who they asked for.`;
  }
  const lines = [`PEOPLE ${patientName.toUpperCase()} CAN REACH THROUGH YOU`];
  for (const member of members) {
    const availability = member.canReceiveCalls ? 'can be contacted' : 'cannot be called right now, but you can still let them know';
    lines.push(`- ${member.displayName}, their ${member.relationshipLabel} (${availability})`);
  }
  lines.push(
    `When ${patientName} asks for one of these people by relationship or name, use request_contact. If they ask for someone not on this list, say kindly that you can let their family know, and use flag_distress with level "low" and a note naming who they asked for.`,
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
