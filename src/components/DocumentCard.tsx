import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
}

export default function DocumentCard({
  document,
  onPress,
  onLongPress,
  selectionMode,
  selected,
  widthPercent,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.card, widthPercent ? { width: widthPercent } : null]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}>
      <View style={[styles.thumbnailWrap, selected && styles.thumbnailWrapSelected]}>
        {document.thumbnailPath ? (
          <Image
            source={{ uri: `file://${document.thumbnailPath}` }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbnailPlaceholder} />
        )}
        <View style={styles.pageBadge}>
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
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    width: '47%',
    marginBottom: 20,
  },
  thumbnailWrap: {
    aspectRatio: 0.75,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  thumbnailWrapSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
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
    backgroundColor: colors.overlay,
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
