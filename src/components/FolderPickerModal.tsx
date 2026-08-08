import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { createFolder, listFolders } from '../db/database';
import { Folder } from '../types/models';
import { promptForText } from '../utils/promptForText';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  currentFolderId?: string | null;
  onClose: () => void;
  onPick: (folderId: string | null) => void;
}

export default function FolderPickerModal({ visible, currentFolderId = null, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const load = useCallback(async () => {
    setFolders(await listFolders());
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function handleCreateFolder() {
    const name = await promptForText('New folder', '');
    if (name && name.trim()) {
      const folder = await createFolder(name.trim());
      onPick(folder.id);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>Move to Folder</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={folders}
            keyExtractor={item => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <TouchableOpacity
                style={[styles.row, currentFolderId === null && styles.rowActive]}
                onPress={() => onPick(null)}>
                <View style={styles.rowIconWrap}>
                  <Icon name="folder-off" size={18} color={colors.textMuted} />
                </View>
                <Text style={styles.rowLabel}>No Folder</Text>
                {currentFolderId === null && (
                  <Icon name="check-circle" size={20} color={colors.accent} />
                )}
              </TouchableOpacity>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, currentFolderId === item.id && styles.rowActive]}
                onPress={() => onPick(item.id)}>
                <View style={styles.rowIconWrap}>
                  <Icon name="folder" size={18} color={colors.gold} />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.name}
                </Text>
                {currentFolderId === item.id && (
                  <Icon name="check-circle" size={20} color={colors.accent} />
                )}
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.newFolderRow} onPress={handleCreateFolder}>
            <Icon name="create-new-folder" size={20} color={colors.white} />
            <Text style={styles.newFolderText}>New Folder</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '75%',
    paddingBottom: 20,
    elevation: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  rowActive: {
    backgroundColor: colors.accentMuted,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  newFolderText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});
