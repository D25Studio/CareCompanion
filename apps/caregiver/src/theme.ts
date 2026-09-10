/** Caregiver-facing theme: calm, clear, standard sizes with generous touch targets. */
export const colors = {
  background: '#F6F8F7',
  surface: '#FFFFFF',
  text: '#17201B',
  textMuted: '#55635C',
  primary: '#2E7D4F',
  primaryText: '#FFFFFF',
  secondary: '#1F5F8B',
  danger: '#B3261E',
  dangerSoft: '#FDECEA',
  warning: '#8A6D1F',
  warningSoft: '#FFF6DB',
  success: '#2E7D4F',
  successSoft: '#E6F4EC',
  border: '#D6DED9',
  pending: '#8A6D1F',
} as const;

export const spacing = {
  xs: 6,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
} as const;

export const fontSizes = {
  title: 26,
  heading: 20,
  body: 17,
  small: 14,
} as const;

export const MIN_TOUCH_TARGET = 48;
