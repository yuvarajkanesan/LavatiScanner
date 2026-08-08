import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  createFolder,
  deleteFolder,
  listFoldersWithDocCounts,
  renameFolder,
  setFolderLocked,
} from '../db/database';
import { Folder } from '../types/models';

type FolderRow = Folder & { docCount: number };
import { hasPin, verifyPin } from '../services/pin';
import { getBiometryLabel, isBiometricUnlockEnabled, unlockWithBiometrics } from '../services/biometrics';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import Fab from '../components/Fab';
import Icon from '../components/Icon';
import PinPad from '../components/PinPad';
import { promptForText } from '../utils/promptForText';

type Props = NativeStackScreenProps<RootStackParamList, 'Folders'>;

export default function FoldersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [pendingFolder, setPendingFolder] = useState<Folder | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometryLabel, setBiometryLabel] = useState<string | undefined>();

  const load = useCallback(async () => {
    setFolders(await listFoldersWithDocCounts());
    setBiometricEnabled(await isBiometricUnlockEnabled());
    setBiometryLabel((await getBiometryLabel()) ?? undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleCreateFolder() {
    const name = await promptForText('New folder', '');
    if (name && name.trim()) {
      await createFolder(name.trim());
      load();
    }
  }

  async function handleOpenFolder(folder: Folder) {
    if (!folder.isLocked) {
      navigation.navigate('FolderDetail', { folderId: folder.id });
      return;
    }
    if (await isBiometricUnlockEnabled()) {
      const ok = await unlockWithBiometrics();
      if (ok) {
        navigation.navigate('FolderDetail', { folderId: folder.id });
        return;
      }
    }
    setPinError(undefined);
    setPendingFolder(folder);
  }

  async function handleRetryBiometric() {
    if (!pendingFolder) return;
    const ok = await unlockWithBiometrics();
    if (ok) {
      const folder = pendingFolder;
      setPendingFolder(null);
      navigation.navigate('FolderDetail', { folderId: folder.id });
    }
  }

  async function handlePinSubmit(pin: string) {
    if (!pendingFolder) return;
    const ok = await verifyPin(pin);
    if (ok) {
      const folder = pendingFolder;
      setPendingFolder(null);
      navigation.navigate('FolderDetail', { folderId: folder.id });
    } else {
      setPinError('Incorrect PIN, try again.');
    }
  }

  async function handleToggleLock(folder: Folder) {
    if (!folder.isLocked) {
      const pinSet = await hasPin();
      if (!pinSet) {
        Alert.alert(
          'No PIN set',
          'Set a vault PIN in Settings before locking a folder.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Settings',
              onPress: () => navigation.navigate('MainTabs', { screen: 'Settings' }),
            },
          ],
        );
        return;
      }
    }
    await setFolderLocked(folder.id, !folder.isLocked);
    load();
  }

  function handleLongPress(folder: Folder) {
    Alert.alert(folder.name, undefined, [
      { text: 'Rename', onPress: () => handleRename(folder) },
      {
        text: folder.isLocked ? 'Unlock' : 'Lock',
        onPress: () => handleToggleLock(folder),
      },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(folder) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleRename(folder: Folder) {
    const name = await promptForText('Rename folder', folder.name);
    if (name && name.trim()) {
      await renameFolder(folder.id, name.trim());
      load();
    }
  }

  function handleDelete(folder: Folder) {
    Alert.alert(
      'Delete folder',
      `Delete "${folder.name}"? Documents inside will move to the root.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteFolder(folder.id);
            load();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {folders.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Icon name="create-new-folder" size={36} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No folders yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a folder to organize your documents.
          </Text>
        </View>
      ) : (
        <FlatList
          data={folders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.accent]} tintColor={colors.accent} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleOpenFolder(item)}
              onLongPress={() => handleLongPress(item)}
              activeOpacity={0.7}>
              <View style={styles.folderIconWrap}>
                <Icon name="folder" size={26} color={colors.gold} />
                {item.isLocked && (
                  <View style={styles.lockBadge}>
                    <Icon name="lock" size={11} color={colors.white} />
                  </View>
                )}
              </View>
              <View style={styles.folderTextWrap}>
                <Text style={styles.folderName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.folderCount}>
                  {item.docCount} document{item.docCount === 1 ? '' : 's'}
                </Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      <Fab onPress={handleCreateFolder} icon="create-new-folder" />

      <PinPad
        visible={pendingFolder !== null}
        title="Enter PIN"
        subtitle={pendingFolder ? `Unlock "${pendingFolder.name}"` : undefined}
        error={pinError}
        onSubmit={handlePinSubmit}
        onCancel={() => setPendingFolder(null)}
        onBiometricRetry={biometricEnabled ? handleRetryBiometric : undefined}
        biometryLabel={biometryLabel}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  folderIconWrap: {
    marginRight: 14,
  },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  folderTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  folderCount: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
