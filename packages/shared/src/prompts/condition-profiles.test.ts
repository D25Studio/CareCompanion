import { describe, expect, it } from 'vitest';

import { CONDITION_IDS, DEFAULT_CONDITION_ID, DEMENTIA_CONDITIONS, DEMENTIA_STAGES } from '../constants';
import { UNSPECIFIED_KEY, resolveGuidance } from './condition-profile';
import { CONDITION_PROFILES, getConditionProfile } from './condition-profiles';
import { GREETING_INSTRUCTIONS, QUIET_CHECK_IN_INSTRUCTIONS } from './companion-core';

/**
 * These checks run against every registered profile, so a new condition gets the same
 * guarantees as dementia the moment it is added to the registry.
 */
describe('condition profile registry', () => {
  it('has a profile for every condition id and no extras', () => {
    expect(Object.keys(CONDITION_PROFILES).sort()).toEqual([...CONDITION_IDS].sort());
    expect(getConditionProfile(DEFAULT_CONDITION_ID)).toBeDefined();
  });

  for (const id of CONDITION_IDS) {
    const profile = getConditionProfile(id);

    describe(`profile "${id}"`, () => {
      it('is registered under its own id', () => {
        expect(profile.id).toBe(id);
      });

      it('has non-empty required text', () => {
        expect(profile.label.trim().length).toBeGreaterThan(0);
        expect(profile.personDescription.trim().length).toBeGreaterThan(0);
        expect(profile.communicationRules.trim().length).toBeGreaterThan(0);
      });

      it('has guidance and a label for every subtype, plus an "unspecified" fallback', () => {
        expect(profile.subtypes).toContain(UNSPECIFIED_KEY);
        for (const subtype of profile.subtypes) {
          expect(profile.subtypeGuidance[subtype]?.trim().length ?? 0).toBeGreaterThan(0);
          expect(profile.subtypeLabels[subtype]?.trim().length ?? 0).toBeGreaterThan(0);
        }
      });

      it('has guidance and a label for every stage, plus an "unspecified" fallback', () => {
        expect(profile.stages).toContain(UNSPECIFIED_KEY);
        for (const stage of profile.stages) {
          expect(profile.stageGuidance[stage]?.trim().length ?? 0).toBeGreaterThan(0);
          expect(profile.stageLabels[stage]?.trim().length ?? 0).toBeGreaterThan(0);
        }
      });

      it('only uses placeholders the builder knows how to fill', () => {
        const allText = [
          profile.communicationRules,
          profile.calmingGuidance,
          profile.safetyGuidance,
          ...Object.values(profile.subtypeGuidance),
          ...Object.values(profile.stageGuidance),
        ].join('\n');
        const placeholders = allText.match(/\{[^}]+\}/g) ?? [];
        for (const placeholder of placeholders) {
          expect(['{patient}', '{PATIENT}', '{assistant}']).toContain(placeholder);
        }
      });
    });
  }
});

describe('dementia profile', () => {
  it('mirrors the Postgres enums stored on patient_settings', () => {
    const profile = getConditionProfile('dementia');
    expect(profile.subtypes).toEqual(DEMENTIA_CONDITIONS);
    expect(profile.stages).toEqual(DEMENTIA_STAGES);
  });
});

describe('resolveGuidance', () => {
  const guidance = { alpha: 'A', unspecified: 'fallback' };

  it('returns the matching entry', () => {
    expect(resolveGuidance(guidance, 'alpha')).toBe('A');
  });

  it('falls back to unspecified for unknown keys', () => {
    expect(resolveGuidance(guidance, 'nope')).toBe('fallback');
  });

  it('returns an empty string when even the fallback is missing', () => {
    expect(resolveGuidance({}, 'nope')).toBe('');
  });
});

describe('spoken one-off instructions', () => {
  it('do not reintroduce the habits the main prompt bans', () => {
    for (const text of [GREETING_INSTRUCTIONS, QUIET_CHECK_IN_INSTRUCTIONS]) {
      expect(text).not.toMatch(/\bhelper\b/i);
      expect(text).not.toMatch(/\bdear\b|\bsweetheart\b/i);
    }
    expect(GREETING_INSTRUCTIONS).toContain('Do not describe what you are or what you can do.');
    expect(QUIET_CHECK_IN_INSTRUCTIONS).toContain('Do not ask if they are alright');
  });
});
