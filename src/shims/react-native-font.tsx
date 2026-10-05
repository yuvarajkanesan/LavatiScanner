import * as React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  TextProps,
  TextInputProps,
} from 'react-native';

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
  const flat = StyleSheet.flatten(props.style) ?? {};
  return (
    <RNText
      ref={ref}
      {...props}
      style={[{fontFamily: fontFamilyForWeight(flat.fontWeight)}, props.style]}
    />
  );
});

export const TextInput = React.forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput(props, ref) {
  const flat = StyleSheet.flatten(props.style) ?? {};
  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={[{fontFamily: fontFamilyForWeight(flat.fontWeight)}, props.style]}
    />
  );
});

export * from 'react-native';
