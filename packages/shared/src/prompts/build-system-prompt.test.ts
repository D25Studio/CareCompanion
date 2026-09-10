import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, describeLocalTime, type PromptContext } from './build-system-prompt';

const baseContext: PromptContext = {
  patientPreferredName: 'Bob',
  condition: 'alzheimers',
  stage: 'middle',
  assistantName: 'Companion',
  orientationFacts: { home: 'Your home in Manly', today_carer: 'Maria comes at 2 in the afternoon' },
  customGuidance: 'Bob loves talking about his boat, the Seabird.',
  members: [
    { relationshipLabel: 'wife', displayName: 'Sarah', canReceiveCalls: true },
    { relationshipLabel: 'son', displayName: 'Tom', canReceiveCalls: false },
  ],
  localTimeDescription: 'Wednesday 9 September, half past nine in the morning',
};

describe('buildSystemPrompt', () => {
  it('names the assistant and patient in the identity line', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt.startsWith('You are Companion, a gentle voice helper on the phone of Bob')).toBe(true);
  });

  it('always includes the fixed communication rules', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Never argue, correct, or contradict.');
    expect(prompt).toContain('Never say "remember"');
    expect(prompt).toContain('Do not give medical advice');
  });

  it('includes condition and stage guidance', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("living with Alzheimer's disease");
    expect(prompt).toContain('Stage: middle.');
  });

  it('uses Lewy body specific guidance when configured', () => {
    const prompt = buildSystemPrompt({ ...baseContext, condition: 'lewy_body' });
    expect(prompt).toContain('Never contradict or dismiss something they see or hear.');
  });

  it('lists members with availability and humanises orientation keys', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('- Sarah, their wife (can be contacted)');
    expect(prompt).toContain('- Tom, their son (cannot be called right now');
    expect(prompt).toContain('- Home: Your home in Manly');
    expect(prompt).toContain('- Today carer: Maria comes at 2 in the afternoon');
  });

  it('places caregiver guidance after the rules and marks it subordinate', () => {
    const prompt = buildSystemPrompt(baseContext);
    const rulesIndex = prompt.indexOf('HOW YOU SPEAK');
    const guidanceIndex = prompt.indexOf("GUIDANCE FROM BOB'S FAMILY");
    expect(rulesIndex).toBeGreaterThan(-1);
    expect(guidanceIndex).toBeGreaterThan(rulesIndex);
    expect(prompt).toContain('If it conflicts, the rules above win.');
    expect(prompt).toContain('Seabird');
  });

  it('omits the guidance section when none is provided', () => {
    const prompt = buildSystemPrompt({ ...baseContext, customGuidance: '   ' });
    expect(prompt).not.toContain('GUIDANCE FROM');
  });

  it('handles an empty member list with a safe fallback', () => {
    const prompt = buildSystemPrompt({ ...baseContext, members: [] });
    expect(prompt).toContain('No family members are set up yet.');
  });

  it('falls back to a default assistant name and a neutral patient name', () => {
    const prompt = buildSystemPrompt({ ...baseContext, assistantName: '', patientPreferredName: '' });
    expect(prompt.startsWith('You are Companion, a gentle voice helper on the phone of friend')).toBe(true);
  });
});

describe('describeLocalTime', () => {
  const timeZone = 'Australia/Sydney';

  it('describes whole hours in the morning', () => {
    // 2026-09-09T09:00 in Sydney (UTC+10) == 2026-09-08T23:00Z
    const text = describeLocalTime(new Date('2026-09-08T23:00:00Z'), timeZone);
    expect(text).toBe("Wednesday 9 September, 9 o'clock in the morning");
  });

  it('describes half past in the afternoon', () => {
    const text = describeLocalTime(new Date('2026-09-09T04:30:00Z'), timeZone);
    expect(text).toBe('Wednesday 9 September, half past 2 in the afternoon');
  });

  it('describes quarter to in the evening', () => {
    const text = describeLocalTime(new Date('2026-09-09T08:45:00Z'), timeZone);
    expect(text).toBe('Wednesday 9 September, quarter to 7 in the evening');
  });

  it('describes arbitrary minutes at night', () => {
    const text = describeLocalTime(new Date('2026-09-09T12:07:00Z'), timeZone);
    expect(text).toBe('Wednesday 9 September, 10 07 at night');
  });
});
