import React, {useMemo} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

interface Props {
  onPress: () => void;
  icon?: string;
  size?: number;
  bottom?: number;
  variant?: 'primary' | 'secondary';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Fab({onPress, icon = 'add', size = 58, bottom = 24, variant = 'primary'}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSecondary = variant === 'secondary';
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  function handlePressIn() {
    scale.value = withSpring(0.92, {damping: 15, stiffness: 400});
  }
  function handlePressOut() {
    scale.value = withSpring(1, {damping: 15, stiffness: 400});
  }

  const shape = {
    width: size,
    height: size,
    borderRadius: size / 2,
    bottom,
  };

  if (isSecondary) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.fab, styles.secondary, shape, animatedStyle]}>
        <Icon name={icon} size={size * 0.45} color={colors.accent} />
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.fab, shape, animatedStyle]}>
      <LinearGradient
        colors={colors.gradientPrimary}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={[styles.gradientFill, shape]}>
        <Icon name={icon} size={size * 0.45} color={colors.white} />
      </LinearGradient>
    </AnimatedPressable>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    gradientFill: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 4,
      shadowOpacity: 0.18,
    },
  });
