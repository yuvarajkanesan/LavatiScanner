export const lightColors = {
  background: '#FFFFFF',
  surface: '#F2F7FA',
  border: '#DFE9EF',
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
};

export type AppColors = typeof lightColors;

/** Static default (light) palette — kept for screens that are intentionally
 * always dark/light regardless of the app theme (e.g. the camera/scan
 * flows). Theme-aware screens should use `useTheme()` from ThemeContext
 * instead. */
export const colors = lightColors;
