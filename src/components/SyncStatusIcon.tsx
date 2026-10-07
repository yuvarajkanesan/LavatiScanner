import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleProp, TextStyle} from 'react-native';
import Icon from './Icon';
import {useTheme} from '../theme/ThemeContext';
import {SyncState} from '../services/syncStatus';

interface Props {
  state: SyncState;
  size?: number;
  /** Overrides the state's own colour (e.g. white on the blue header). */
  color?: string;
  style?: StyleProp<TextStyle>;
}

const ICONS: Record<SyncState, string> = {
  synced: 'cloud-check-outline',
  syncing: 'sync',
  waiting: 'cloud-upload-outline',
  paused: 'cloud-off-outline',
  failed: 'cloud-alert-outline',
};

export function useSyncStateColor(state: SyncState): string {
  const {colors} = useTheme();
  switch (state) {
    case 'synced':
      return colors.success;
    case 'syncing':
      return colors.accent;
    case 'failed':
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

/** One cloud icon per sync state; the syncing icon spins slowly. */
export default function SyncStatusIcon({state, size = 20, color, style}: Props) {
  const stateColor = useSyncStateColor(state);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'syncing') {
      spin.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, spin]);

  const icon = (
    <Icon
      name={ICONS[state]}
      family="community"
      size={size}
      color={color ?? stateColor}
      style={style}
    />
  );

  if (state !== 'syncing') {
    return icon;
  }
  return (
    <Animated.View
      style={{
        transform: [
          {rotate: spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})},
        ],
      }}>
      {icon}
    </Animated.View>
  );
}
