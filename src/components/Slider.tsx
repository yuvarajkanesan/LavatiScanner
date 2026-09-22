import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  min: number;
  max: number;
  value: number;
  /** Fires continuously while dragging - use for a live label/preview. */
  onValueChange: (value: number) => void;
  /** Fires once on release with the final value - use to persist/commit. */
  onSlidingComplete?: (value: number) => void;
  step?: number;
}

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 6;

/**
 * Plain PanResponder slider (matches this codebase's existing hand-rolled
 * drag-handle pattern in TrimPageScreen/CropPageScreen) rather than pulling
 * in a native slider dependency for one control.
 */
export default function Slider({
  min,
  max,
  value,
  onValueChange,
  onSlidingComplete,
  step,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const scale = useSharedValue(1);
  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handleLayout(e: LayoutChangeEvent) {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }

  function valueFromX(x: number): number {
    const width = trackWidthRef.current;
    const ratio = width > 0 ? Math.min(1, Math.max(0, x / width)) : 0;
    let next = min + ratio * (max - min);
    if (step) {
      next = Math.round(next / step) * step;
    }
    return Math.min(max, Math.max(min, next));
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        scale.value = withSpring(1.2, { damping: 12, stiffness: 300 });
        onValueChange(valueFromX(evt.nativeEvent.locationX));
      },
      onPanResponderMove: evt => {
        onValueChange(valueFromX(evt.nativeEvent.locationX));
      },
      onPanResponderRelease: evt => {
        scale.value = withSpring(1, { damping: 8, stiffness: 260 });
        onSlidingComplete?.(valueFromX(evt.nativeEvent.locationX));
      },
    }),
  ).current;

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const thumbLeft = ratio * trackWidth;

  return (
    <View style={styles.wrap} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: thumbLeft - THUMB_SIZE / 2 },
          animatedThumbStyle,
        ]}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      height: THUMB_SIZE + 12,
      justifyContent: 'center',
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: TRACK_HEIGHT / 2,
    },
    thumb: {
      position: 'absolute',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: colors.white,
      borderWidth: 3,
      borderColor: colors.accent,
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
  });
