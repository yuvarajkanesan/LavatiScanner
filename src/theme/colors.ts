/** Rotating palette for per-item color variety (document cards, folder
 * icons, page badges) — pick via `funPalette[index % funPalette.length]`.
 * This is what actually reads as "playful/colorful" day to day, since most
 * of the UI is a list of many small items rather than one big hero. */
const FUN_PALETTE = [
  '#FF6B6B', // coral
  '#FFA34D', // tangerine
  '#FFC93C', // sunflower
  '#2EC4B6', // mint
  '#4EA8DE', // sky
  '#9B5DE5', // violet
  '#FF7EB3', // bubblegum
  '#06D6A0', // jade
] as const;

export const lightColors = {
  background: '#FFFDFB',
  surface: '#F5F3FF',
  border: '#E6E1F7',
  text: '#241E38',
  textMuted: '#71678C',
  accent: '#6C4CF1',
  accentDark: '#5334D6',
  accentMuted: '#EFEAFF',
  gold: '#E0A32E',
  danger: '#E4483F',
  success: '#2EC4B6',
  overlay: 'rgba(0,0,0,0.55)',
  white: '#FFFFFF',
  black: '#000000',
  /** Bold gradient accents for premium CTAs (buttons, FAB, active tab, hero badges). */
  gradientPrimary: ['#8B5CF6', '#5B5FEF'] as [string, string],
  gradientGold: ['#F3C065', '#E0A32E'] as [string, string],
  /** Warm, high-energy gradient for playful highlight moments (empty
   * states, celebratory badges, "new"/streak callouts). */
  gradientSunset: ['#FF6B6B', '#FFA34D'] as [string, string],
  /** Subtle full-screen wash — accent bleeding faintly from the top-left corner into the base background. */
  gradientBackground: ['#F3EFFF', '#FFFDFB'] as [string, string],
  /** Stronger banner gradient for header/hero bands. */
  gradientHero: ['#EFE9FF', '#FBF7FF'] as [string, string],
  funPalette: FUN_PALETTE as unknown as string[],
};

export const darkColors: AppColors = {
  background: '#161027',
  surface: '#211A38',
  border: '#332A52',
  text: '#F2EEFF',
  textMuted: '#A79BC7',
  accent: '#9B87F7',
  accentDark: '#B7A6FF',
  accentMuted: '#2C2350',
  gold: '#E7B65A',
  danger: '#F16B62',
  success: '#3DDBC9',
  overlay: 'rgba(0,0,0,0.65)',
  white: '#FFFFFF',
  black: '#000000',
  gradientPrimary: ['#9B6BFF', '#6C4CF1'],
  gradientGold: ['#FFD98A', '#E7B65A'],
  gradientSunset: ['#FF8080', '#FFB870'],
  gradientBackground: ['#1D1533', '#161027'],
  gradientHero: ['#2A2050', '#1E1738'],
  funPalette: FUN_PALETTE as unknown as string[],
};

export type AppColors = typeof lightColors;

/** Static default (light) palette — kept for screens that are intentionally
 * always dark/light regardless of the app theme (e.g. the camera/scan
 * flows). Theme-aware screens should use `useTheme()` from ThemeContext
 * instead. */
export const colors = lightColors;
