export const lightColors = {
  background: '#FFFFFF',
  surface: '#F3F3F4',
  border: '#E3E4E6',
  text: '#0F2A3D',
  textMuted: '#6B7F8C',
  accent: '#1CA0DE',
  accentDark: '#1580B3',
  accentMuted: '#E4F4FC',
  gold: '#E0A32E',
  danger: '#E4483F',
  overlay: 'rgba(0,0,0,0.55)',
  white: '#FFFFFF',
  black: '#000000',
  /** Bold gradient accents for premium CTAs (buttons, FAB, active tab, hero badges). */
  gradientPrimary: ['#2E6BF2', '#17B4E0'] as [string, string],
  gradientGold: ['#F3C065', '#E0A32E'] as [string, string],
  /** Subtle full-screen wash — accent bleeding faintly from the top-left corner into the base background. */
  gradientBackground: ['#EAF6FC', '#FFFFFF'] as [string, string],
  /** Stronger banner gradient for header/hero bands. */
  gradientHero: ['#E4F4FC', '#F7FBFD'] as [string, string],
};

export const darkColors: AppColors = {
  background: '#0E1720',
  surface: '#17222D',
  border: '#25323E',
  text: '#EAF2F8',
  textMuted: '#8FA1AF',
  accent: '#2FB2F4',
  accentDark: '#59C2F7',
  accentMuted: '#173245',
  gold: '#E7B65A',
  danger: '#F16B62',
  overlay: 'rgba(0,0,0,0.65)',
  white: '#FFFFFF',
  black: '#000000',
  gradientPrimary: ['#4F8CFF', '#38D9E8'],
  gradientGold: ['#FFD98A', '#E7B65A'],
  gradientBackground: ['#152230', '#0E1720'],
  gradientHero: ['#1A2C3D', '#14202C'],
};

export type AppColors = typeof lightColors;

/** Static default (light) palette — kept for screens that are intentionally
 * always dark/light regardless of the app theme (e.g. the camera/scan
 * flows). Theme-aware screens should use `useTheme()` from ThemeContext
 * instead. */
export const colors = lightColors;
