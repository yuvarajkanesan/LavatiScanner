import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AppText from './AppText';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { DocumentSummary } from '../types/models';
import { formatBytes, formatDate, formatTime } from '../utils/format';
import { isDocumentSynced } from '../services/driveBackup';

interface Props {
  document: DocumentSummary;
  onPress: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  /** Position in the list — cycles through the app's fun palette so the
   * list reads as colorful/varied rather than every row looking identical. */
  index?: number;
  /** Shows the Drive sync badge - only when the caller confirmed Google
   * Drive is actually connected. */
  showSyncStatus?: boolean;
  /** Pre-resolved small cached thumbnail - falls back to the document's
   * full-resolution page file until it's ready. */
  thumbnailUri?: string;
}

export default function DocumentListRow({
  document,
  onPress,
  onLongPress,
  selectionMode,
  selected,
  index = 0,
  showSyncStatus,
  thumbnailUri,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accentColor = colors.funPalette[index % colors.funPalette.length];
  const synced = isDocumentSynced(document);
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}>
      <View style={[styles.accentStripe, { backgroundColor: accentColor }]} />
      {selectionMode && (
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected && <Icon name="check" size={14} color={colors.white} />}
        </View>
      )}
      {document.thumbnailPath ? (
        <Image
          source={{ uri: thumbnailUri ?? `file://${document.thumbnailPath}` }}
          style={[styles.thumbnail, { borderColor: `${accentColor}55` }]}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder} />
      )}
      <View style={styles.info}>
        <AppText style={styles.name} numberOfLines={1}>
          {document.name}
        </AppText>
        <Text style={styles.meta} numberOfLines={1}>
          {document.pageCount} page{document.pageCount === 1 ? '' : 's'} |{' '}
          {formatDate(document.updatedAt)} | {formatTime(document.updatedAt)} |{' '}
          {formatBytes(document.totalSizeBytes)}
        </Text>
      </View>
      {showSyncStatus && !selectionMode && (
        <Icon
          name={synced ? 'cloud-done' : 'cloud-queue'}
          size={18}
          color={synced ? colors.success : colors.textMuted}
          style={styles.syncIcon}
        />
      )}
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
    borderRadius: 18,
    padding: 10,
    paddingLeft: 14,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
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
    borderRadius: 10,
    borderWidth: 2,
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
  syncIcon: {
    marginRight: 6,
  },
});
