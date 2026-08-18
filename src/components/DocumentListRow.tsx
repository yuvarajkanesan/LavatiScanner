import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { DocumentSummary } from '../types/models';
import { formatBytes, formatDate, formatTime } from '../utils/format';

interface Props {
  document: DocumentSummary;
  onPress: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
}

export default function DocumentListRow({
  document,
  onPress,
  onLongPress,
  selectionMode,
  selected,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}>
      {selectionMode && (
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected && <Icon name="check" size={14} color={colors.white} />}
        </View>
      )}
      {document.thumbnailPath ? (
        <Image
          source={{ uri: `file://${document.thumbnailPath}` }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder} />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {document.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {document.pageCount} page{document.pageCount === 1 ? '' : 's'} |{' '}
          {formatDate(document.updatedAt)} | {formatTime(document.updatedAt)} |{' '}
          {formatBytes(document.totalSizeBytes)}
        </Text>
      </View>
      {!selectionMode && <Icon name="chevron-right" size={22} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  rowSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkCircleSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  thumbnail: {
    width: 44,
    height: 58,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  thumbnailPlaceholder: {
    width: 44,
    height: 58,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  info: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textMuted,
  },
});
