import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, describeLocalTime, type PromptContext } from './build-system-prompt';

const baseContext: PromptContext = {
  patientPreferredName: 'Bob',
  conditionId: 'dementia',
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

/** Index of the first line that starts with the heading, or -1. Headings are the section anchors the model reads. */
function headingIndex(prompt: string, heading: string): number {
  return prompt.indexOf(`\n${heading}`);
}

describe('buildSystemPrompt', () => {
  it('names the assistant and patient in the identity line and frames the companion as an equal', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt.startsWith("You are Companion, a voice companion on Bob's phone. Bob is living with dementia.")).toBe(true);
    expect(prompt).not.toContain('helper');
    expect(prompt).not.toContain('gentle voice');
  });

  it('fills every placeholder, including the upper-cased headings', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).not.toMatch(/\{patient\}|\{PATIENT\}|\{assistant\}/);
    expect(prompt).toContain('KEEPING BOB CALM');
    expect(prompt).toContain('FACTS YOU MAY SHARE WITH BOB');
    expect(prompt).toContain("GUIDANCE FROM BOB'S FAMILY");
    expect(prompt).toContain('You are Companion.');
  });

  it('always includes the universal anti-patronising rules', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('HOW YOU COME ACROSS');
    expect(prompt).toContain('Talk with them the way a trusted friend of their own generation would');
    expect(prompt).toContain('Do not praise or cheer.');
    expect(prompt).toContain('Do not use pet names or diminutives');
    expect(prompt).toContain('Do not narrate their feelings back at them');
    expect(prompt).toContain('Do not talk down.');
  });

  it('always includes a keeping-calm section with de-escalation steps', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Your first move is always to slow down and say less.');
    expect(prompt).toContain('Never say "calm down"');
    expect(prompt).toContain('Do not comment on the episode');
    expect(prompt).toContain('use flag_distress with level "medium" while you keep them company');
  });

  it('includes the dementia communication rules, subtype and stage guidance', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('TALKING WITH SOMEONE LIVING WITH DEMENTIA');
    expect(prompt).toContain('Never test memory.');
    expect(prompt).toContain("Bob is living with Alzheimer's disease");
    expect(prompt).toContain('Stage: middle.');
  });

  it('appends the condition-specific calming and safety additions to the universal sections', () => {
    const prompt = buildSystemPrompt(baseContext);
    const calmIndex = headingIndex(prompt, 'KEEPING BOB CALM');
    const mustNotIndex = headingIndex(prompt, 'WHAT YOU MUST NOT DO');
    const sundowningIndex = prompt.indexOf('Late afternoon and evening are often harder.');
    expect(sundowningIndex).toBeGreaterThan(calmIndex);
    expect(sundowningIndex).toBeLessThan(mustNotIndex);

    const safetyIndex = headingIndex(prompt, 'SAFETY\n');
    const wanderingIndex = prompt.indexOf('leaving the house to go somewhere');
    const factsIndex = headingIndex(prompt, 'FACTS YOU MAY SHARE');
    expect(wanderingIndex).toBeGreaterThan(safetyIndex);
    expect(wanderingIndex).toBeLessThan(factsIndex);
  });

  it('orders sections: identity, manner, condition rules, subtype, stage, calm, boundaries, family, safety, data', () => {
    const prompt = buildSystemPrompt(baseContext);
    const order = [
      '\nHOW YOU COME ACROSS\n',
      '\nTALKING WITH SOMEONE LIVING WITH DEMENTIA\n',
      "\nBob is living with Alzheimer's disease",
      '\nStage: middle.',
      '\nKEEPING BOB CALM\n',
      '\nWHAT YOU MUST NOT DO\n',
      '\nWHEN THEY ASK FOR SOMEONE\n',
      '\nSAFETY\n',
      '\nFACTS YOU MAY SHARE WITH BOB\n',
      '\nPEOPLE BOB CAN REACH THROUGH YOU\n',
      "\nGUIDANCE FROM BOB'S FAMILY\n",
      '\nTOOLS\n',
    ].map((marker) => prompt.indexOf(marker));
    for (const index of order) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('uses Lewy body specific guidance when configured', () => {
    const prompt = buildSystemPrompt({ ...baseContext, condition: 'lewy_body' });
    expect(prompt).toContain('Never contradict or dismiss something they see or hear.');
  });

  it('tells the model early-stage people will resent being talked down to', () => {
    const prompt = buildSystemPrompt({ ...baseContext, stage: 'early' });
    expect(prompt).toContain('will notice and resent being talked down to');
  });

  it('falls back to "unspecified" guidance for unknown subtype or stage values', () => {
    const prompt = buildSystemPrompt({ ...baseContext, condition: 'not_a_real_subtype', stage: 'not_a_real_stage' });
    expect(prompt).toContain('the specific type has not been provided');
    expect(prompt).toContain('Stage: not specified.');
  });

  it('defaults to the dementia profile when no conditionId is given', () => {
    const { conditionId: _omitted, ...withoutCondition } = baseContext;
    const prompt = buildSystemPrompt(withoutCondition);
    expect(prompt).toContain('Bob is living with dementia.');
    expect(prompt).toContain('TALKING WITH SOMEONE LIVING WITH DEMENTIA');
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
    const rulesIndex = prompt.indexOf('HOW YOU COME ACROSS');
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
    expect(prompt.startsWith("You are Companion, a voice companion on friend's phone.")).toBe(true);
  });

  it('never leaves an empty section (no triple newlines)', () => {
    const prompt = buildSystemPrompt({ ...baseContext, customGuidance: null, members: [] });
    expect(prompt).not.toMatch(/\n{3,}/);
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
