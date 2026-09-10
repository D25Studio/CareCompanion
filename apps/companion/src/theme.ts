/**
 * Patient-facing theme. Warm, high-contrast, very large.
 * All text colours meet WCAG AA (4.5:1) against their backgrounds.
 */
export const colors = {
  background: '#FFF9F0',
  surface: '#FFFFFF',
  text: '#1F1A17',
  textMuted: '#4A423D',
  primary: '#1F5F8B',
  primaryText: '#FFFFFF',
  accent: '#2E7D4F',
  danger: '#B3261E',
  dangerText: '#FFFFFF',
  border: '#D9CFC4',
  listening: '#2E7D4F',
  speaking: '#1F5F8B',
  thinking: '#8A6D1F',
} as const;

export const fontSizes = {
  caption: 30,
  title: 38,
  button: 34,
  code: 64,
  small: 22,
} as const;

export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
} as const;

/** Minimum height for anything the patient taps. */
export const MIN_TOUCH_TARGET = 96;

/** Cap OS font scaling so the single screen never overflows. */
export const MAX_FONT_SCALE = 1.4;
