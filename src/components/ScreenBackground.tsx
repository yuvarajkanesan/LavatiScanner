import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from '../theme/ThemeContext';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Subtle full-screen gradient wash (accent bleeding faintly from the top-left
 * corner into the base background) — replaces a flat `colors.background` fill
 * on premium screens. Renders as the screen's root container. */
export default function ScreenBackground({children, style}: Props) {
  const {colors} = useTheme();
  return (
    <LinearGradient
      colors={colors.gradientBackground}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={[{flex: 1}, style]}>
      {children}
    </LinearGradient>
  );
}
