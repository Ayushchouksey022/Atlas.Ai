export interface ColorPalette {
  background: string;
  surface: string;
  surfaceSubtle: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderFocus: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;

  // Verdict Visual Language (PRD Section 11)
  verdictShield: string;
  verdictShieldBg: string;
  verdictShieldBorder: string;

  verdictInjection: string;
  verdictInjectionBg: string;
  verdictInjectionBorder: string;

  verdictOverride: string;
  verdictOverrideBg: string;
  verdictOverrideBorder: string;
}

export const lightTheme: ColorPalette = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  border: '#E2E8F0',
  borderFocus: '#2563EB',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryActive: '#1E40AF',
  error: '#DC2626',
  errorBg: '#FEF2F2',
  success: '#16A34A',
  successBg: '#F0FDF4',

  verdictShield: '#2563EB',
  verdictShieldBg: '#EFF6FF',
  verdictShieldBorder: '#BFDBFE',

  verdictInjection: '#16A34A',
  verdictInjectionBg: '#F0FDF4',
  verdictInjectionBorder: '#BBF7D0',

  verdictOverride: '#D97706',
  verdictOverrideBg: '#FFFBEB',
  verdictOverrideBorder: '#FDE68A',
};

export const darkTheme: ColorPalette = {
  background: '#0B0F19',
  surface: '#111827',
  surfaceSubtle: '#1F2937',
  card: '#111827',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',
  border: '#1F2937',
  borderFocus: '#3B82F6',
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  primaryActive: '#2563EB',
  error: '#EF4444',
  errorBg: '#450A0A',
  success: '#22C55E',
  successBg: '#052E16',

  verdictShield: '#60A5FA',
  verdictShieldBg: '#172554',
  verdictShieldBorder: '#1E40AF',

  verdictInjection: '#4ADE80',
  verdictInjectionBg: '#052E16',
  verdictInjectionBorder: '#166534',

  verdictOverride: '#FBBF24',
  verdictOverrideBg: '#451A03',
  verdictOverrideBorder: '#92400E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  md: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 24, lineHeight: 32 },
  xxl: { fontSize: 32, lineHeight: 40 },
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

/** Minimum touch target size in pixels (PRD 14 requirement) */
export const MIN_TOUCH_TARGET = 44;
