import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';
import { useFontScale } from '../theme/FontScaleContext';

/**
 * Drop-in replacement for RN's `Text` that honors the user's Settings ->
 * Text Size preference. Screens still set `fontSize` (and optionally
 * `lineHeight`) in their own styles exactly as before - this just scales
 * whatever numbers it finds by the current font scale before handing them
 * to the real `Text`. Untouched if the style has no `fontSize` at all, so
 * it's a safe swap-in for any existing `<Text>` usage.
 */
export default function AppText({ style, ...props }: TextProps) {
  const { fontScale } = useFontScale();
  const flat = StyleSheet.flatten(style) || {};
  const scaledStyle =
    fontScale === 1 || typeof flat.fontSize !== 'number'
      ? style
      : [
          style,
          {
            fontSize: flat.fontSize * fontScale,
            ...(typeof flat.lineHeight === 'number'
              ? { lineHeight: flat.lineHeight * fontScale }
              : null),
          },
        ];
  return <Text {...props} style={scaledStyle} />;
}
