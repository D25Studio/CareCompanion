/**
 * Minimal copy of the conventions in packages/shared/src/constants.ts.
 * Edge Functions are bundled by the Supabase CLI from this folder only, so the
 * TypeScript sources in packages/ cannot be imported here. Keep both in sync.
 */

export const ROOM_NAME_PREFIX = 'circle-';
export const IDENTITY_PREFIX = { patient: 'patient:', caregiver: 'caregiver:' } as const;

export function roomNameForCircle(circleId: string): string {
  return `${ROOM_NAME_PREFIX}${circleId}`;
}

export function patientIdentity(profileId: string): string {
  return `${IDENTITY_PREFIX.patient}${profileId}`;
}

export function caregiverIdentity(profileId: string): string {
  return `${IDENTITY_PREFIX.caregiver}${profileId}`;
}

export const DAILY_SUMMARY_SYSTEM_PROMPT = `
You write the daily summary that a family receives each evening about their relative who is living with dementia and uses a voice helper app.
You are given the day's session notes, contact requests and any alerts.
Write for a busy family member: a short paragraph on how the day went overall, then a few short lines on anything that needs attention, and one line on contact requests (how many, who for, how they were resolved). If there were no sessions, say so in one sentence.
Be factual and kind. Do not diagnose or speculate about medical causes. Do not repeat the same request many times; group repeated requests and give a count.
Keep it under 180 words. Plain prose, no headings, no bullet symbols.
`.trim();
