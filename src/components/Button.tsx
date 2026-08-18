import React, {useMemo} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon, {IconFamily} from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

export type ButtonVariant = 'gradient' | 'solid' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  label?: string;
  icon?: string;
  iconFamily?: IconFamily;
  onPress: () => void;
  variant?: ButtonVariant;
  gradient?: 'primary' | 'gold';
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  fullWidth?: boolean;
}

const SIZES: Record<
  ButtonSize,
  {height: number; paddingHorizontal: number; fontSize: number; iconSize: number; radius: number}
> = {
  sm: {height: 38, paddingHorizontal: 14, fontSize: 13, iconSize: 16, radius: 12},
  md: {height: 48, paddingHorizontal: 20, fontSize: 15, iconSize: 19, radius: 14},
  lg: {height: 56, paddingHorizontal: 26, fontSize: 16, iconSize: 22, radius: 16},
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Premium button primitive: gradient/solid/outline/ghost variants with a
 * subtle spring press-scale. This is the app's first shared button —
 * previously every screen hand-rolled its own TouchableOpacity. */
export default function Button({
  label,
  icon,
  iconFamily = 'community',
  onPress,
  variant = 'gradient',
  gradient = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  danger = false,
  fullWidth = false,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.96, {damping: 15, stiffness: 400});
  }
  function handlePressOut() {
    scale.value = withSpring(1, {damping: 15, stiffness: 400});
  }

  const dims = SIZES[size];
  const isBare = variant === 'outline' || variant === 'ghost';
  const foreground = isBare ? (danger ? colors.danger : colors.accent) : colors.white;
  const gradientColors = danger
    ? ([colors.danger, colors.danger] as [string, string])
    : gradient === 'gold'
    ? colors.gradientGold
    : colors.gradientPrimary;

  const content = loading ? (
    <ActivityIndicator color={foreground} size="small" />
  ) : (
    <>
      {icon && <Icon name={icon} family={iconFamily} size={dims.iconSize} color={foreground} />}
      {label && (
        <Text style={[styles.label, {fontSize: dims.fontSize, color: foreground}]}>
          {label}
        </Text>
      )}
    </>
  );

  const sizeStyle = {
    height: dims.height,
    paddingHorizontal: dims.paddingHorizontal,
    borderRadius: dims.radius,
  };

  if (variant === 'gradient') {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[fullWidth ? styles.fullWidth : styles.autoWidth, animatedStyle]}>
        <LinearGradient
          colors={isDisabled ? [colors.border, colors.border] : gradientColors}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={[styles.base, styles.shadow, sizeStyle]}>
          {content}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.base,
        sizeStyle,
        fullWidth ? styles.fullWidth : styles.autoWidth,
        animatedStyle,
        variant === 'solid' && [
          styles.shadow,
          {backgroundColor: isDisabled ? colors.border : danger ? colors.danger : colors.accent},
        ],
        variant === 'outline' && {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: isDisabled ? colors.border : danger ? colors.danger : colors.accent,
        },
        variant === 'ghost' && {backgroundColor: 'transparent'},
        isDisabled && styles.disabled,
      ]}>
      {content}
    </AnimatedPressable>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    fullWidth: {
      width: '100%',
    },
    autoWidth: {
      alignSelf: 'flex-start',
    },
    shadow: {
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.22,
      shadowRadius: 6,
    },
    disabled: {
      opacity: 0.6,
    },
    label: {
      fontWeight: '700',
    },
  });
