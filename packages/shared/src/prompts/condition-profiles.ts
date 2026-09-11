import type { ConditionId } from '../constants';
import type { ConditionProfile } from './condition-profile';
import { DEMENTIA_PROFILE } from './dementia-profile';

/**
 * Registry of every condition the companion knows how to talk with.
 *
 * Adding a condition:
 *  1. Add its id to `CONDITION_IDS` in `constants.ts`.
 *  2. Copy `dementia-profile.ts`, write the condition's rules, subtypes and stages.
 *  3. Add the profile here. TypeScript will refuse to compile until every id has a profile.
 *  4. Bump `PROMPT_VERSION` and add a test in `build-system-prompt.test.ts`.
 */
export const CONDITION_PROFILES: Readonly<Record<ConditionId, ConditionProfile>> = {
  dementia: DEMENTIA_PROFILE,
};

export function getConditionProfile(id: ConditionId): ConditionProfile {
  return CONDITION_PROFILES[id];
}
