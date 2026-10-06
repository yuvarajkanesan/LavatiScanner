import React, {useMemo} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import FeatureBadge from './FeatureBadge';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {toolIcons} from '../theme/toolIcons';
import {PercentWidth, percentWidth, useResponsive} from '../utils/responsive';

export interface ToolShortcut {
  key: string;
  icon: string;
  label: string;
  onPress: () => void | Promise<void>;
}

/** Flex-wrap grid of tool shortcut cards, shared by the Tools screen (full
 * catalog) and the Home screen (a shorter, most-used subset). `columns`
 * overrides the responsive default - the Home tray wants a fixed count to
 * match its compact layout regardless of screen width. `compact` shrinks
 * card padding/icon size - the Home tray sits above the tab bar and needs
 * to read as a quick strip, not a full destination screen like Tools. */
export default function ToolGrid({
  shortcuts,
  busyKey,
  columns,
  compact,
}: {
  shortcuts: ToolShortcut[];
  busyKey?: string | null;
  columns?: number;
  compact?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const {toolColumns} = useResponsive();
  const cols = columns ?? toolColumns;
  // Gap budget shared between the `cols - 1` gaps in a row. Cards get this
  // as an explicit marginRight (omitted on the last column) instead of the
  // container's `justifyContent: 'space-between'`, which spreads a short
  // final row's items to the far edges and leaves a hole in the middle -
  // exactly when the shortcut count isn't a multiple of `cols` (e.g. 5
  // items in a 3-column grid).
  const gapPercent = 3;
  const cardWidthPercent = percentWidth(
    (100 - gapPercent * (cols - 1)) / cols,
  );
  return (
    <View style={styles.grid}>
      {shortcuts.map((s, index) => (
        <ToolCard
          key={s.key}
          shortcut={s}
          busy={busyKey === s.key}
          styles={styles}
          widthPercent={cardWidthPercent}
          marginRight={(index + 1) % cols === 0 ? 0 : gapPercent}
          iconSize={compact ? 34 : 44}
        />
      ))}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ToolCard({
  shortcut,
  busy,
  styles,
  widthPercent,
  marginRight,
  iconSize,
}: {
  shortcut: ToolShortcut;
  busy: boolean;
  styles: ReturnType<typeof createStyles>;
  widthPercent: PercentWidth;
  marginRight: number;
  iconSize: number;
}) {
  const {colors} = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));
  const token = toolIcons[shortcut.key as keyof typeof toolIcons];

  return (
    <AnimatedPressable
      style={[
        styles.card,
        {width: widthPercent, marginRight: `${marginRight}%`},
        animatedStyle,
      ]}
      onPress={shortcut.onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, {damping: 15, stiffness: 400});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, {damping: 15, stiffness: 400});
      }}>
      {busy ? (
        <View style={[styles.cardIconWrap, {width: iconSize, height: iconSize, borderRadius: iconSize / 2}]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FeatureBadge
          icon={token?.icon ?? shortcut.icon}
          family={token?.family}
          color={colors.accent}
          size={iconSize}
          variant="soft"
        />
      )}
      <Text style={styles.cardLabel}>{shortcut.label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors: AppColors, compact?: boolean) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: compact ? 8 : 12,
    },
    card: {
      alignItems: 'center',
      paddingVertical: compact ? 10 : 16,
      borderRadius: compact ? 14 : 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 3,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.1,
      shadowRadius: 5,
    },
    cardIconWrap: {
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardLabel: {
      marginTop: compact ? 5 : 8,
      fontSize: compact ? 11 : 12,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
