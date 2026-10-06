import React from 'react';
import { Text, TextProps } from 'react-native';

/**
 * Thin alias for RN's `Text`. The Settings -> Text Size preference is now
 * applied globally (see `src/shims/react-native-font.tsx`), so this no
 * longer needs to scale anything itself - kept as a stable import for its
 * existing call sites.
 */
export default function AppText(props: TextProps) {
  return <Text {...props} />;
}
