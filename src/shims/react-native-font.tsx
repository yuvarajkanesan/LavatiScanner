import * as React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  TextProps,
  TextInputProps,
} from 'react-native';
import {useFontScale} from '../theme/FontScaleContext';

/**
 * Applies the app's professional UI font (Inter) to every `Text`/`TextInput`
 * in `src/` automatically, without touching the hundreds of existing call
 * sites. Wired up via metro.config.js, which redirects any `import ... from
 * 'react-native'` whose *origin* is a file under `src/` to this module
 * instead (third-party packages still get the real `react-native`,
 * unaffected) - re-exporting everything else from the real module below
 * keeps every other RN API working exactly as before.
 *
 * Android's native font matching only auto-resolves two weights per family
 * (regular/bold) from a single `fontFamily` name - existing styles already
 * set explicit numeric `fontWeight` (400/500/600/700/800) expecting real
 * visual distinction, so instead each weight is bundled as its own static
 * font file (Inter-Regular/Medium/SemiBold/Bold/ExtraBold.ttf, under
 * android/app/src/main/assets/fonts/) and selected here by reading the
 * already-set `fontWeight` out of the flattened style.
 */

/** Scales a flattened style's `fontSize`/`lineHeight` by the user's Settings
 * -> Text Size preference, applied here (rather than requiring every call
 * site to opt in via `AppText`) so the setting actually affects the whole
 * app. Returns `null` when there's nothing to scale, so callers can skip
 * adding an extra style layer at the default 100%. */
function scaledSizeStyle(
  flat: {fontSize?: unknown; lineHeight?: unknown},
  fontScale: number,
): {fontSize: number; lineHeight?: number} | null {
  if (fontScale === 1 || typeof flat.fontSize !== 'number') {
    return null;
  }
  return {
    fontSize: flat.fontSize * fontScale,
    ...(typeof flat.lineHeight === 'number'
      ? {lineHeight: flat.lineHeight * fontScale}
      : null),
  };
}

function fontFamilyForWeight(weight: unknown): string {
  switch (String(weight ?? '400')) {
    case '500':
      return 'Inter-Medium';
    case '600':
      return 'Inter-SemiBold';
    case 'bold':
    case '700':
      return 'Inter-Bold';
    case '800':
    case '900':
      return 'Inter-ExtraBold';
    default:
      // 100-300 (no Light/ExtraLight bundled) and 400/'normal'/unset all
      // fall back to Regular rather than silently rendering in the OS
      // default font.
      return 'Inter-Regular';
  }
}

export const Text = React.forwardRef<
  React.ComponentRef<typeof RNText>,
  TextProps
>(function Text(props, ref) {
  const {fontScale} = useFontScale();
  const flat = StyleSheet.flatten(props.style) ?? {};
  return (
    <RNText
      ref={ref}
      {...props}
      style={[
        {fontFamily: fontFamilyForWeight(flat.fontWeight)},
        props.style,
        scaledSizeStyle(flat, fontScale),
      ]}
    />
  );
});

export const TextInput = React.forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput(props, ref) {
  const {fontScale} = useFontScale();
  const flat = StyleSheet.flatten(props.style) ?? {};
  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={[
        {fontFamily: fontFamilyForWeight(flat.fontWeight)},
        props.style,
        scaledSizeStyle(flat, fontScale),
      ]}
    />
  );
});

export * from 'react-native';
