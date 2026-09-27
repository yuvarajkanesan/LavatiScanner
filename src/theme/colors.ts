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
  background: '#F7FAFF',
  surface: '#EDF2FC',
  border: '#DBE5F5',
  text: '#1A2333',
  textMuted: '#5C6B85',
  accent: '#2F6FED',
  accentDark: '#1E54C4',
  accentMuted: '#E3ECFC',
  gold: '#E0A32E',
  danger: '#E4483F',
  success: '#2EC4B6',
  overlay: 'rgba(0,0,0,0.55)',
  white: '#FFFFFF',
  black: '#000000',
  /** Bold gradient accents for premium CTAs (buttons, FAB, active tab, hero badges). */
  gradientPrimary: ['#4C86FF', '#2F6FED'] as [string, string],
  gradientGold: ['#F3C065', '#E0A32E'] as [string, string],
  /** Warm, high-energy gradient for playful highlight moments (empty
   * states, celebratory badges, "new"/streak callouts). */
  gradientSunset: ['#FF6B6B', '#FFA34D'] as [string, string],
  /** Subtle full-screen wash — accent bleeding faintly from the top-left corner into the base background. */
  gradientBackground: ['#E9F0FF', '#F7FAFF'] as [string, string],
  /** Stronger banner gradient for header/hero bands. */
  gradientHero: ['#E4EDFC', '#FAFCFF'] as [string, string],
  funPalette: FUN_PALETTE as unknown as string[],
};

export const darkColors: AppColors = {
  background: '#1C2333',
  surface: '#28324A',
  border: '#3E4B6B',
  text: '#F2F5FC',
  textMuted: '#AEB9D1',
  accent: '#6E9BFF',
  accentDark: '#8FB2FF',
  accentMuted: '#2E3A57',
  gold: '#E7B65A',
  danger: '#F16B62',
  success: '#3DDBC9',
  overlay: 'rgba(0,0,0,0.55)',
  white: '#FFFFFF',
  black: '#000000',
  gradientPrimary: ['#6E9BFF', '#3E74E8'],
  gradientGold: ['#FFD98A', '#E7B65A'],
  gradientSunset: ['#FF8080', '#FFB870'],
  gradientBackground: ['#28324A', '#1C2333'],
  gradientHero: ['#31405F', '#242E45'],
  funPalette: FUN_PALETTE as unknown as string[],
};

export type AppColors = typeof lightColors;

/** Static default (light) palette — kept for screens that are intentionally
 * always dark/light regardless of the app theme (e.g. the camera/scan
 * flows). Theme-aware screens should use `useTheme()` from ThemeContext
 * instead. */
export const colors = lightColors;
