import { describe, expect, it } from 'vitest';

import type { CareCircleMember, PatientSettings } from '@care/shared';

import { type CircleContext, findMember, fromRows, isInQuietHours, toPromptMembers } from './session-context.ts';

function member(overrides: Partial<CareCircleMember>): CareCircleMember {
  return {
    id: 'm-' + Math.random().toString(36).slice(2),
    circle_id: 'circle-1',
    caregiver_id: 'cg-1',
    relationship_label: 'wife',
    is_owner: true,
    can_receive_calls: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const wife = member({ id: 'm-wife', caregiver_id: 'cg-sarah', relationship_label: 'wife' });
const son = member({ id: 'm-son', caregiver_id: 'cg-tom', relationship_label: 'son', is_owner: false });
const names = new Map([
  ['cg-sarah', 'Sarah'],
  ['cg-tom', 'Tom'],
]);

const context: CircleContext = fromRows('circle-1', 'patient-1', null, [wife, son], names);

describe('fromRows', () => {
  it('produces safe defaults when settings are missing', () => {
    expect(context.patientPreferredName).toBe('friend');
    expect(context.condition).toBe('unspecified');
    expect(context.stage).toBe('unspecified');
    expect(context.requestTimeoutSeconds).toBe(90);
    expect(context.storeTranscripts).toBe(false);
    expect(context.members.map((candidate) => candidate.displayName)).toEqual(['Sarah', 'Tom']);
  });

  it('falls back to the relationship label when a caregiver has no display name', () => {
    const anonymous = fromRows('c', 'p', null, [member({ caregiver_id: 'unknown', relationship_label: 'daughter' })], new Map());
    expect(anonymous.members[0]?.displayName).toBe('daughter');
  });

  it('ignores malformed jsonb rather than crashing the session', () => {
    const settings = {
      circle_id: 'circle-1',
      preferred_name: 'Bob',
      condition: 'lewy_body',
      stage: 'middle',
      assistant_name: '',
      assistant_voice: '',
      speaking_rate: 0.8,
      orientation_facts: ['not', 'an', 'object'],
      custom_guidance: null,
      unavailable_responses: { not_a_reason: 'x' },
      no_answer_message: null,
      request_timeout_seconds: 120,
      store_transcripts: true,
      updated_at: new Date().toISOString(),
    } as unknown as PatientSettings;

    const result = fromRows('circle-1', 'patient-1', settings, [], new Map());
    expect(result.patientPreferredName).toBe('Bob');
    expect(result.condition).toBe('lewy_body');
    expect(result.assistantName).toBe('Companion');
    expect(result.assistantVoice).toBe('marin');
    expect(result.orientationFacts).toEqual({});
    expect(result.unavailableResponses).toEqual({});
    expect(result.requestTimeoutSeconds).toBe(120);
    expect(result.storeTranscripts).toBe(true);
  });
});

describe('findMember', () => {
  it('matches by relationship label, ignoring case and "my"', () => {
    expect(findMember(context, 'Wife')?.id).toBe('m-wife');
    expect(findMember(context, 'my son')?.id).toBe('m-son');
  });

  it('matches by display name', () => {
    expect(findMember(context, 'sarah')?.id).toBe('m-wife');
  });

  it('matches partial phrases the model might pass through', () => {
    expect(findMember(context, 'my wife Sarah')?.id).toBe('m-wife');
    expect(findMember(context, 'Tommy')?.id).toBe('m-son');
  });

  it('returns null for unknown people and empty input', () => {
    expect(findMember(context, 'brother')).toBeNull();
    expect(findMember(context, '   ')).toBeNull();
  });
});

describe('isInQuietHours', () => {
  const quiet = member({ quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00' });
  const daytime = member({ quiet_hours_start: '09:00:00', quiet_hours_end: '17:00:00' });
  const timeZone = 'UTC';

  it('is false when no quiet hours are set', () => {
    expect(isInQuietHours(wife, new Date('2026-09-09T23:00:00Z'), timeZone)).toBe(false);
  });

  it('handles windows that wrap past midnight', () => {
    expect(isInQuietHours(quiet, new Date('2026-09-09T23:00:00Z'), timeZone)).toBe(true);
    expect(isInQuietHours(quiet, new Date('2026-09-10T03:30:00Z'), timeZone)).toBe(true);
    expect(isInQuietHours(quiet, new Date('2026-09-10T07:00:00Z'), timeZone)).toBe(false);
    expect(isInQuietHours(quiet, new Date('2026-09-10T12:00:00Z'), timeZone)).toBe(false);
  });

  it('handles same-day windows', () => {
    expect(isInQuietHours(daytime, new Date('2026-09-10T12:00:00Z'), timeZone)).toBe(true);
    expect(isInQuietHours(daytime, new Date('2026-09-10T08:59:00Z'), timeZone)).toBe(false);
    expect(isInQuietHours(daytime, new Date('2026-09-10T17:00:00Z'), timeZone)).toBe(false);
  });

  it('respects the configured time zone', () => {
    // 12:00 UTC is 22:00 in Sydney (AEST), which is inside the 22:00-07:00 window.
    expect(isInQuietHours(quiet, new Date('2026-09-10T12:00:00Z'), 'Australia/Sydney')).toBe(true);
    expect(isInQuietHours(quiet, new Date('2026-09-10T12:00:00Z'), timeZone)).toBe(false);
  });
});

describe('toPromptMembers', () => {
  it('marks a member unavailable during quiet hours or when calls are off', () => {
    const offDuty = member({ id: 'm-off', caregiver_id: 'cg-off', relationship_label: 'carer', can_receive_calls: false });
    const promptMembers = toPromptMembers(fromRows('c', 'p', null, [wife, offDuty], names));
    expect(promptMembers.find((candidate) => candidate.relationshipLabel === 'wife')?.canReceiveCalls).toBe(true);
    expect(promptMembers.find((candidate) => candidate.relationshipLabel === 'carer')?.canReceiveCalls).toBe(false);
  });
});
