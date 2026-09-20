import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { DocumentSummary } from '../types/models';
import { formatBytes, formatDate, formatTime } from '../utils/format';
import { PercentWidth } from '../utils/responsive';

interface Props {
  document: DocumentSummary;
  onPress: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  /** Overrides the card's default 2-column (47%) width — pass a computed
   * percentage to match a different grid column count (e.g. on tablets). */
  widthPercent?: PercentWidth;
  /** Position in the list — cycles through the app's fun palette so the
   * grid reads as colorful/varied rather than every card looking identical. */
  index?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function DocumentCard({
  document,
  onPress,
  onLongPress,
  selectionMode,
  selected,
  widthPercent,
  index = 0,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accentColor = colors.funPalette[index % colors.funPalette.length];
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.card, widthPercent ? { width: widthPercent } : null, animatedStyle]}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 14, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 8, stiffness: 260 });
      }}>
      <View
        style={[
          styles.thumbnailWrap,
          { borderColor: selected ? colors.accent : `${accentColor}55` },
          selected && styles.thumbnailWrapSelected,
        ]}>
        {document.thumbnailPath ? (
          <Image
            source={{ uri: `file://${document.thumbnailPath}` }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbnailPlaceholder} />
        )}
        <View style={[styles.pageBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.pageBadgeText}>{document.pageCount}</Text>
        </View>
        {selectionMode && (
          <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
            {selected && <Icon name="check" size={14} color={colors.white} />}
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {document.name}
      </Text>
      <Text style={styles.date} numberOfLines={1}>
        {document.pageCount} page{document.pageCount === 1 ? '' : 's'} |{' '}
        {formatDate(document.updatedAt)} | {formatTime(document.updatedAt)} |{' '}
        {formatBytes(document.totalSizeBytes)}
      </Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    width: '47%',
    marginBottom: 20,
  },
  thumbnailWrap: {
    aspectRatio: 0.75,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  thumbnailWrapSelected: {
    borderWidth: 2.5,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  pageBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pageBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  name: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  date: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
