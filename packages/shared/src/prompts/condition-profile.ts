import type { ConditionId } from '../constants';

/**
 * Key that every `subtypeGuidance` and `stageGuidance` map must contain. It is what the
 * builder falls back to when a stored value is missing or unknown, so a settings mismatch
 * can never leave the companion without guidance.
 */
export const UNSPECIFIED_KEY = 'unspecified';

/**
 * Everything the prompt builder needs to know about one medical condition.
 *
 * The universal parts of the prompt (how the companion comes across, keeping the person
 * calm, safety, reaching family, tools) are the same for every condition and live in
 * `companion-core.ts`. A profile supplies only what is specific to the condition, and the
 * builder slots each piece into a fixed position. That way a new condition is a new file
 * plus a registry entry, with no changes to the builder or the agent.
 *
 * All text fields may use the placeholders `{patient}`, `{PATIENT}` (upper-cased) and
 * `{assistant}`; the builder fills them in.
 */
export interface ConditionProfile {
  /** Matches the registry key and a value in `CONDITION_IDS`. */
  id: ConditionId;

  /** Human-readable name shown to caregivers, e.g. "Dementia". */
  label: string;

  /**
   * Completes the sentence "{patient} ..." in the identity line, e.g. "is living with dementia".
   * Keep it to plain, non-clinical words; the person never hears this, but it sets the model's frame.
   */
  personDescription: string;

  /**
   * Fixed communication rules for this condition. Not editable by caregivers; caregiver guidance
   * is layered on top of them, never in place of them. Should include its own heading line.
   */
  communicationRules: string;

  /** Subtype keys exactly as stored in `patient_settings.condition`. Must include `UNSPECIFIED_KEY`. */
  subtypes: readonly string[];

  /** Caregiver-facing label for each subtype. */
  subtypeLabels: Readonly<Record<string, string>>;

  /** Short behavioural adjustments per subtype. Must include `UNSPECIFIED_KEY`. */
  subtypeGuidance: Readonly<Record<string, string>>;

  /** Stage keys exactly as stored in `patient_settings.stage`. Must include `UNSPECIFIED_KEY`. */
  stages: readonly string[];

  /** Caregiver-facing label for each stage. */
  stageLabels: Readonly<Record<string, string>>;

  /** Short behavioural adjustments per stage. Must include `UNSPECIFIED_KEY`. */
  stageGuidance: Readonly<Record<string, string>>;

  /**
   * Condition-specific situations that unsettle people and how to handle them. Appended to the
   * universal KEEPING CALM section. May be empty.
   */
  calmingGuidance: string;

  /** Condition-specific safety triggers. Appended to the universal SAFETY section. May be empty. */
  safetyGuidance: string;
}

/**
 * Looks up guidance for a stored key, falling back to the "unspecified" entry when the key is
 * missing or unknown (for example after a settings enum changes ahead of the prompt package).
 */
export function resolveGuidance(guidance: Readonly<Record<string, string>>, key: string): string {
  return guidance[key] ?? guidance[UNSPECIFIED_KEY] ?? '';
}
