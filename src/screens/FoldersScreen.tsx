import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  SectionList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Share from 'react-native-share';
import Alert from '../utils/customAlert';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {TabScreenProps} from '../navigation/types';
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  listDocuments,
  listFoldersWithDocCounts,
  listPages,
  moveDocumentToFolder,
  renameDocument,
  renameFolder,
  searchDocumentsByText,
  setFolderLocked,
  createDocument,
  addPage as addPageRecord,
} from '../db/database';
import {deleteDocumentFiles, copyPageFile} from '../services/fileStorage';
import {buildPdfFromImages, parsePageOcrBlocks} from '../services/pdfExport';
import {getThumbnail} from '../services/nativeImageFilter';
import {isGoogleDriveSignedIn} from '../services/googleDrive';
import {mapWithConcurrency} from '../utils/concurrency';
import {scanTimestampName} from '../utils/format';
import {DocumentSummary, Folder} from '../types/models';

type FolderRow = Folder & {docCount: number};
import {hasPin, verifyPin} from '../services/pin';
import {
  getBiometryLabel,
  isBiometricUnlockEnabled,
  unlockWithBiometrics,
} from '../services/biometrics';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import DocumentListRow from '../components/DocumentListRow';
import FolderPickerModal from '../components/FolderPickerModal';
import OptionSheet, {SheetOption} from '../components/OptionSheet';
import Icon from '../components/Icon';
import PinPad from '../components/PinPad';
import {promptForText} from '../utils/promptForText';

type Props = TabScreenProps<'AllFiles'>;

type SortMode =
  | 'name_asc'
  | 'name_desc'
  | 'created_desc'
  | 'created_asc'
  | 'modified_desc'
  | 'modified_asc';
type FolderAction = 'move' | 'copy' | null;
type BulkBusy = 'delete' | 'merge' | 'share' | 'copy' | 'move' | null;

type Section =
  | {key: 'folders'; title: string; data: FolderRow[]}
  | {key: 'files'; title: string; data: DocumentSummary[]};

const SORT_OPTIONS: SheetOption[] = [
  {
    key: 'modified_desc',
    label: 'Date Modified (Newest First)',
    icon: 'sort-clock-descending-outline',
    family: 'community',
  },
  {
    key: 'modified_asc',
    label: 'Date Modified (Oldest First)',
    icon: 'sort-clock-ascending-outline',
    family: 'community',
  },
  {
    key: 'created_desc',
    label: 'Date Created (Newest First)',
    icon: 'sort-calendar-descending',
    family: 'community',
  },
  {
    key: 'created_asc',
    label: 'Date Created (Oldest First)',
    icon: 'sort-calendar-ascending',
    family: 'community',
  },
  {
    key: 'name_asc',
    label: 'Name (A–Z)',
    icon: 'sort-alphabetical-ascending',
    family: 'community',
  },
  {
    key: 'name_desc',
    label: 'Name (Z–A)',
    icon: 'sort-alphabetical-descending',
    family: 'community',
  },
];

export default function FoldersScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [contentMatchIds, setContentMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [sortMode, setSortMode] = useState<SortMode>('modified_desc');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folderAction, setFolderAction] = useState<FolderAction>(null);
  const [bulkBusy, setBulkBusy] = useState<BulkBusy>(null);
  const [moreMenuDoc, setMoreMenuDoc] = useState<DocumentSummary | null>(
    null,
  );
  const [pendingFolder, setPendingFolder] = useState<Folder | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometryLabel, setBiometryLabel] = useState<string | undefined>();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [driveConnected, setDriveConnected] = useState(false);

  const resolveThumbnails = useCallback(async (docs: DocumentSummary[]) => {
    const targets = docs.filter(d => d.thumbnailPath);
    const resolved = await mapWithConcurrency(targets, 4, async doc => {
      try {
        return [doc.id, await getThumbnail(doc.thumbnailPath as string)] as const;
      } catch {
        return [doc.id, `file://${doc.thumbnailPath}`] as const;
      }
    });
    setThumbnails(prev => {
      const next = {...prev};
      for (const [id, uri] of resolved) {
        next[id] = uri;
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const [folderList, rootDocs] = await Promise.all([
      listFoldersWithDocCounts(),
      listDocuments(null),
    ]);
    setFolders(folderList);
    setDocuments(rootDocs);
    setDriveConnected(isGoogleDriveSignedIn());
    setBiometricEnabled(await isBiometricUnlockEnabled());
    setBiometryLabel((await getBiometryLabel()) ?? undefined);
    setLoading(false);
    resolveThumbnails(rootDocs);
  }, [resolveThumbnails]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Full-text search: matches document *content* (OCR'd page text), unioned
  // with the plain in-memory name filter below. Debounced since (unlike the
  // name filter) each keystroke now means a real DB query.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setContentMatchIds(new Set());
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      searchDocumentsByText(q).then(matches => {
        if (!cancelled) {
          setContentMatchIds(new Set(matches.map(d => d.id)));
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function applySort(next: string) {
    setSortMode(next as SortMode);
  }

  const filteredFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? folders.filter(f => f.name.toLowerCase().includes(q)) : folders;
  }, [folders, query]);

  const filteredSortedDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? documents.filter(
          d => d.name.toLowerCase().includes(q) || contentMatchIds.has(d.id),
        )
      : documents;
    const sorted = [...base];
    switch (sortMode) {
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'created_desc':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'created_asc':
        sorted.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'modified_desc':
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'modified_asc':
        sorted.sort((a, b) => a.updatedAt - b.updatedAt);
        break;
    }
    return sorted;
  }, [documents, query, sortMode, contentMatchIds]);

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    if (filteredFolders.length > 0) {
      result.push({key: 'folders', title: 'Folders', data: filteredFolders});
    }
    if (filteredSortedDocuments.length > 0) {
      result.push({
        key: 'files',
        title: 'Files',
        data: filteredSortedDocuments,
      });
    }
    return result;
  }, [filteredFolders, filteredSortedDocuments]);

  const selectedDocuments = useMemo(
    () => documents.filter(d => selectedIds.includes(d.id)),
    [documents, selectedIds],
  );

  async function handleCreateFolder() {
    const name = await promptForText('New folder', '');
    if (name && name.trim()) {
      await createFolder(name.trim());
      load();
    }
  }

  async function handleOpenFolder(folder: Folder) {
    if (!folder.isLocked) {
      navigation.navigate('FolderDetail', {folderId: folder.id});
      return;
    }
    if (await isBiometricUnlockEnabled()) {
      const ok = await unlockWithBiometrics();
      if (ok) {
        navigation.navigate('FolderDetail', {folderId: folder.id});
        return;
      }
    }
    setPinError(undefined);
    setPendingFolder(folder);
  }

  async function handleRetryBiometric() {
    if (!pendingFolder) {
      return;
    }
    const ok = await unlockWithBiometrics();
    if (ok) {
      const folder = pendingFolder;
      setPendingFolder(null);
      navigation.navigate('FolderDetail', {folderId: folder.id});
    }
  }

  async function handlePinSubmit(pin: string) {
    if (!pendingFolder) {
      return;
    }
    const ok = await verifyPin(pin);
    if (ok) {
      const folder = pendingFolder;
      setPendingFolder(null);
      navigation.navigate('FolderDetail', {folderId: folder.id});
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
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Go to Settings',
              onPress: () => navigation.navigate('Settings'),
            },
          ],
        );
        return;
      }
    }
    await setFolderLocked(folder.id, !folder.isLocked);
    load();
  }

  function handleFolderLongPress(folder: Folder) {
    Alert.alert(folder.name, undefined, [
      {text: 'Rename', onPress: () => handleRenameFolder(folder)},
      {
        text: folder.isLocked ? 'Unlock' : 'Lock',
        onPress: () => handleToggleLock(folder),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => handleDeleteFolder(folder),
      },
      {text: 'Cancel', style: 'cancel'},
    ]);
  }

  async function handleRenameFolder(folder: Folder) {
    const name = await promptForText('Rename folder', folder.name);
    if (name && name.trim()) {
      await renameFolder(folder.id, name.trim());
      load();
    }
  }

  function handleDeleteFolder(folder: Folder) {
    Alert.alert(
      'Delete folder',
      `Delete "${folder.name}"? Documents inside will move to the root.`,
      [
        {text: 'Cancel', style: 'cancel'},
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

  // ---------- Document selection / bulk actions ----------

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id];
      if (next.length === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  }

  function handleDocPress(doc: DocumentSummary) {
    if (selectionMode) {
      toggleSelected(doc.id);
    } else {
      navigation.navigate('DocumentDetail', {docId: doc.id});
    }
  }

  function handleDocLongPress(doc: DocumentSummary) {
    if (selectionMode) {
      toggleSelected(doc.id);
    } else {
      setSelectionMode(true);
      setSelectedIds([doc.id]);
    }
  }

  function handleSelectAll() {
    if (selectedIds.length === filteredSortedDocuments.length) {
      setSelectedIds([]);
      setSelectionMode(false);
    } else {
      setSelectedIds(filteredSortedDocuments.map(d => d.id));
    }
  }

  function handleBulkDelete() {
    Alert.alert(
      `Delete ${selectedIds.length} document${
        selectedIds.length === 1 ? '' : 's'
      }`,
      "This can't be undone.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy('delete');
            for (const doc of selectedDocuments) {
              await deleteDocument(doc.id);
              await deleteDocumentFiles(doc.id);
            }
            setBulkBusy(null);
            exitSelectionMode();
            load();
          },
        },
      ],
    );
  }

  async function handleBulkShare() {
    try {
      setBulkBusy('share');
      const urls: string[] = [];
      for (const doc of selectedDocuments) {
        const pages = await listPages(doc.id);
        if (pages.length === 0) {
          continue;
        }
        const pdfPath = await buildPdfFromImages(
          pages.map(p => p.filePath),
          doc.name,
          pages.map(p => parsePageOcrBlocks(p.ocrBlocks)),
        );
        urls.push(`file://${pdfPath}`);
      }
      if (urls.length > 0) {
        await Share.open({urls, failOnCancel: false});
      }
    } catch (error) {
      Alert.alert(
        'Share failed',
        'Could not prepare the selected documents for sharing.',
      );
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkMerge() {
    if (selectedIds.length < 2) {
      return;
    }
    try {
      setBulkBusy('merge');
      const allFilePaths: string[] = [];
      const allOcrBlocks: ReturnType<typeof parsePageOcrBlocks>[] = [];
      for (const doc of selectedDocuments) {
        const pages = await listPages(doc.id);
        allFilePaths.push(...pages.map(p => p.filePath));
        allOcrBlocks.push(...pages.map(p => parsePageOcrBlocks(p.ocrBlocks)));
      }
      if (allFilePaths.length === 0) {
        Alert.alert(
          'Nothing to merge',
          'The selected documents have no pages.',
        );
        return;
      }
      const pdfPath = await buildPdfFromImages(
        allFilePaths,
        `Merged_${scanTimestampName()}`,
        allOcrBlocks,
      );
      await Share.open({
        url: `file://${pdfPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
      exitSelectionMode();
    } catch (error) {
      Alert.alert('Merge failed', 'Could not merge the selected documents.');
    } finally {
      setBulkBusy(null);
    }
  }

  function handleMoveOrCopy() {
    Alert.alert(
      `${selectedIds.length} document${selectedIds.length === 1 ? '' : 's'}`,
      'Move relocates the originals. Copy leaves them where they are and duplicates them.',
      [
        {text: 'Move', onPress: () => setFolderAction('move')},
        {text: 'Copy', onPress: () => setFolderAction('copy')},
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  }

  async function handleFolderPicked(folderId: string | null) {
    if (folderAction === 'move') {
      setBulkBusy('move');
      for (const id of selectedIds) {
        await moveDocumentToFolder(id, folderId);
      }
    } else if (folderAction === 'copy') {
      setBulkBusy('copy');
      for (const doc of selectedDocuments) {
        const pages = await listPages(doc.id);
        const newDoc = await createDocument(`${doc.name} (Copy)`, folderId);
        for (const page of pages) {
          const newPath = await copyPageFile(newDoc.id, page.filePath);
          await addPageRecord(newDoc.id, newPath);
        }
      }
    }
    setFolderAction(null);
    setBulkBusy(null);
    exitSelectionMode();
    load();
  }

  async function handleRenameFromMenu() {
    const doc = moreMenuDoc;
    setMoreMenuDoc(null);
    if (!doc) {
      return;
    }
    const name = await promptForText('Rename document', doc.name);
    if (name && name.trim() && name.trim() !== doc.name) {
      await renameDocument(doc.id, name.trim());
      load();
    }
  }

  function handleMoveFromMenu() {
    const doc = moreMenuDoc;
    setMoreMenuDoc(null);
    if (!doc) {
      return;
    }
    setSelectedIds([doc.id]);
    handleMoveOrCopy();
  }

  function handleDeleteFromMenu() {
    const doc = moreMenuDoc;
    setMoreMenuDoc(null);
    if (!doc) {
      return;
    }
    Alert.alert('Delete document', `Delete "${doc.name}"? This can't be undone.`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDocument(doc.id);
          await deleteDocumentFiles(doc.id);
          load();
        },
      },
    ]);
  }

  const moreMenuOptions: SheetOption[] = [
    {key: 'rename', label: 'Rename', icon: 'edit'},
    {key: 'move', label: 'Move / Copy', icon: 'drive-file-move'},
    {key: 'delete', label: 'Delete', icon: 'delete-outline', color: colors.danger},
  ];

  const totalCount = folders.length + documents.length;
  const isEmpty = !loading && totalCount === 0;
  const noMatches =
    !loading && totalCount > 0 && sections.length === 0 && query.trim() !== '';

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={exitSelectionMode}>
            <Icon name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedIds.length} selected
          </Text>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selectedIds.length === filteredSortedDocuments.length
                ? 'Deselect All'
                : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[styles.titleRow, {paddingTop: insets.top + 14}]}>
            <Text style={styles.titleText}>All Files</Text>
            <TouchableOpacity
              onPress={handleCreateFolder}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon name="create-new-folder" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortSheetVisible(true)}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon name="sort" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectionMode(true)}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon name="check-circle-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Icon name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
              />
            </View>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => navigation.navigate('Settings')}
              hitSlop={8}>
              <Icon name="settings" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.listArea}>
        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : isEmpty ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Icon name="create-new-folder" size={36} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No files yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a folder or scan a document to get started.
            </Text>
          </View>
        ) : noMatches ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Icon name="search-off" size={36} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptySubtitle}>Try a different search.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.accent]}
                tintColor={colors.accent}
              />
            }
            renderSectionHeader={({section}) =>
              sections.length > 1 ? (
                <Text style={styles.sectionHeaderText}>
                  {section.title} ({section.data.length})
                </Text>
              ) : null
            }
            renderItem={({item, index, section}) =>
              section.key === 'folders' ? (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => handleOpenFolder(item as FolderRow)}
                  onLongPress={() => handleFolderLongPress(item as FolderRow)}
                  activeOpacity={0.7}>
                  <View
                    style={[
                      styles.folderIconWrap,
                      {
                        backgroundColor: `${
                          colors.funPalette[index % colors.funPalette.length]
                        }26`,
                      },
                    ]}>
                    <Icon
                      name="folder"
                      size={26}
                      color={colors.funPalette[index % colors.funPalette.length]}
                    />
                    {(item as FolderRow).isLocked && (
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
                      {(item as FolderRow).docCount} document
                      {(item as FolderRow).docCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <DocumentListRow
                  document={item as unknown as DocumentSummary}
                  index={index}
                  onPress={() =>
                    handleDocPress(item as unknown as DocumentSummary)
                  }
                  onLongPress={() =>
                    handleDocLongPress(item as unknown as DocumentSummary)
                  }
                  selectionMode={selectionMode}
                  selected={selectedIds.includes(item.id)}
                  showSyncStatus={driveConnected}
                  thumbnailUri={thumbnails[item.id]}
                  onMore={
                    selectionMode
                      ? undefined
                      : () =>
                          setMoreMenuDoc(item as unknown as DocumentSummary)
                  }
                />
              )
            }
          />
        )}
      </View>

      {selectionMode && (
        <View style={[styles.bulkBar, {paddingBottom: 10 + insets.bottom}]}>
          <BulkAction
            icon="drive-file-move"
            label="Move/Copy"
            busy={bulkBusy === 'move' || bulkBusy === 'copy'}
            disabled={bulkBusy !== null}
            onPress={handleMoveOrCopy}
          />
          <BulkAction
            icon="call-merge"
            label="Merge"
            busy={bulkBusy === 'merge'}
            disabled={bulkBusy !== null || selectedIds.length < 2}
            onPress={handleBulkMerge}
          />
          <BulkAction
            icon="share"
            label="Share"
            busy={bulkBusy === 'share'}
            disabled={bulkBusy !== null}
            onPress={handleBulkShare}
          />
          <BulkAction
            icon="delete-outline"
            label="Delete"
            danger
            busy={bulkBusy === 'delete'}
            disabled={bulkBusy !== null}
            onPress={handleBulkDelete}
          />
        </View>
      )}

      <FolderPickerModal
        visible={folderAction !== null}
        onClose={() => setFolderAction(null)}
        onPick={handleFolderPicked}
      />

      <OptionSheet
        visible={sortSheetVisible}
        title="Sort By"
        options={SORT_OPTIONS}
        selectedKey={sortMode}
        onSelect={applySort}
        onClose={() => setSortSheetVisible(false)}
      />

      <OptionSheet
        visible={moreMenuDoc !== null}
        title={moreMenuDoc?.name ?? ''}
        options={moreMenuOptions}
        selectedKey=""
        onSelect={key => {
          if (key === 'rename') {
            handleRenameFromMenu();
          } else if (key === 'move') {
            handleMoveFromMenu();
          } else if (key === 'delete') {
            handleDeleteFromMenu();
          } else {
            setMoreMenuDoc(null);
          }
        }}
        onClose={() => setMoreMenuDoc(null)}
      />

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

function BulkAction({
  icon,
  label,
  onPress,
  disabled,
  busy,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.bulkAction}
      onPress={onPress}
      disabled={disabled}>
      {busy ? (
        <ActivityIndicator
          color={danger ? colors.danger : colors.accent}
          size="small"
        />
      ) : (
        <Icon
          name={icon}
          size={22}
          color={
            disabled ? colors.textMuted : danger ? colors.danger : colors.accent
          }
        />
      )}
      <Text
        style={[
          styles.bulkActionLabel,
          disabled && styles.bulkActionLabelDisabled,
          danger && !disabled && styles.bulkActionLabelDanger,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 14,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 1,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      padding: 0,
    },
    settingsBtn: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 1,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 14,
    },
    titleText: {
      flex: 1,
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    sectionIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHeaderText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    listArea: {
      flex: 1,
    },
    list: {
      padding: 16,
      paddingBottom: 24,
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    selectionCount: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    selectAllText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
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
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
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
    bulkBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      paddingVertical: 10,
    },
    bulkAction: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    bulkActionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
    },
    bulkActionLabelDisabled: {
      color: colors.textMuted,
    },
    bulkActionLabelDanger: {
      color: colors.danger,
    },
  });
