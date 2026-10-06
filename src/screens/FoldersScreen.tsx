import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import {percentWidth, useResponsive} from '../utils/responsive';
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
import DocumentCard from '../components/DocumentCard';
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
type ViewMode = 'grid' | 'list' | 'folder';

interface FolderSection {
  title: string;
  folderId: string | null;
  folder: FolderRow | null;
  data: DocumentSummary[];
}

/** Sentinel key for the "No Folder" section in collapse-state tracking,
 * since its folderId is null - mirrors Home's folder-grouped list. */
const ROOT_SECTION_KEY = '__root__';

/** Own key, deliberately separate from Home's - a user may well want Home
 * to stay on "list" (recents) while All Files stays organized by folder, or
 * vice versa, so the two screens' view preferences don't fight each other. */
const VIEW_MODE_KEY = 'allfiles_view_mode';

const VIEW_OPTIONS: SheetOption[] = [
  {key: 'grid', label: 'Grid', icon: 'view-grid-outline', family: 'community'},
  {key: 'list', label: 'List', icon: 'view-list-outline', family: 'community'},
  {
    key: 'folder',
    label: 'Folder View',
    icon: 'folder-open-outline',
    family: 'community',
  },
];

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
  const {contentMaxWidth, gridColumns} = useResponsive();
  const cardWidthPercent = percentWidth(100 / gridColumns - 3);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [contentMatchIds, setContentMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [viewMode, setViewMode] = useState<ViewMode>('folder');
  const [viewSheetVisible, setViewSheetVisible] = useState(false);
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
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  // Folders unlocked via PIN/biometric this session - avoids re-prompting
  // every time a section is expanded/collapsed after the first unlock.
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<Set<string>>(
    new Set(),
  );

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
    // Fetches every document, not just root-level ones - the List/Grid view
    // modes are meant to be a flat view of everything regardless of folder,
    // unlike Folder View, which represents a document's folder membership
    // via the folder row itself instead of listing it twice.
    const [folderList, allDocs] = await Promise.all([
      listFoldersWithDocCounts(),
      listDocuments('all'),
    ]);
    setFolders(folderList);
    setDocuments(allDocs);
    setDriveConnected(isGoogleDriveSignedIn());
    setBiometricEnabled(await isBiometricUnlockEnabled());
    setBiometryLabel((await getBiometryLabel()) ?? undefined);
    setLoading(false);
    resolveThumbnails(allDocs);
  }, [resolveThumbnails]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(saved => {
      if (saved === 'grid' || saved === 'list' || saved === 'folder') {
        setViewMode(saved);
      }
    });
  }, []);

  function applyView(next: string) {
    setViewMode(next as ViewMode);
    AsyncStorage.setItem(VIEW_MODE_KEY, next);
  }

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

  function filterSortDocuments(docs: DocumentSummary[]): DocumentSummary[] {
    const q = query.trim().toLowerCase();
    const base = q
      ? docs.filter(
          d => d.name.toLowerCase().includes(q) || contentMatchIds.has(d.id),
        )
      : docs;
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
  }

  // List/Grid show every document regardless of folder.
  const filteredSortedDocuments = useMemo(
    () => filterSortDocuments(documents),
    [documents, query, sortMode, contentMatchIds],
  );

  // Folder View groups every matching document under its folder - same
  // model as Home's folder-grouped list, including that a folder with no
  // matching documents (empty, or none matching the current search) simply
  // doesn't appear rather than showing as an empty section.
  const folderSections = useMemo<FolderSection[]>(() => {
    const byFolder = new Map<string | null, DocumentSummary[]>();
    for (const doc of filteredSortedDocuments) {
      const key = doc.folderId;
      if (!byFolder.has(key)) {
        byFolder.set(key, []);
      }
      byFolder.get(key)!.push(doc);
    }
    const result: FolderSection[] = [];
    for (const folder of folders) {
      const docs = byFolder.get(folder.id);
      if (docs?.length) {
        result.push({title: folder.name, folderId: folder.id, folder, data: docs});
      }
    }
    const rootDocs = byFolder.get(null);
    if (rootDocs?.length) {
      result.push({title: 'No Folder', folderId: null, folder: null, data: rootDocs});
    }
    return result;
  }, [filteredSortedDocuments, folders]);

  const displaySections = useMemo(
    () =>
      folderSections.map(section =>
        collapsedFolders.has(section.folderId ?? ROOT_SECTION_KEY)
          ? {...section, data: []}
          : section,
      ),
    [folderSections, collapsedFolders],
  );

  // Collapsed sections have their `data` zeroed out above for SectionList,
  // so each header's count is looked up here instead (from the
  // un-collapsed folderSections) rather than read off section.data.length.
  const sectionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of folderSections) {
      map.set(section.folderId ?? ROOT_SECTION_KEY, section.data.length);
    }
    return map;
  }, [folderSections]);

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

  function toggleFolderCollapsed(folderId: string | null) {
    const key = folderId ?? ROOT_SECTION_KEY;
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  /** Tapping a folder section header expands/collapses it inline (matching
   * Home's folder-grouped list) - locked folders still gate behind
   * PIN/biometric before their documents become visible, same protection
   * the old tap-to-navigate flow had, just re-targeted at "reveal the
   * section" instead of "open a new screen". */
  async function handleToggleFolderSection(folder: Folder) {
    if (!folder.isLocked || unlockedFolderIds.has(folder.id)) {
      toggleFolderCollapsed(folder.id);
      return;
    }
    if (await isBiometricUnlockEnabled()) {
      const ok = await unlockWithBiometrics();
      if (ok) {
        setUnlockedFolderIds(prev => new Set(prev).add(folder.id));
        setCollapsedFolders(prev => {
          const next = new Set(prev);
          next.delete(folder.id);
          return next;
        });
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
      setUnlockedFolderIds(prev => new Set(prev).add(folder.id));
      setCollapsedFolders(prev => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
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
      setUnlockedFolderIds(prev => new Set(prev).add(folder.id));
      setCollapsedFolders(prev => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
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
  // What counts as "no matches" depends on which dataset the current view
  // mode actually renders - Folder View groups by folder (`folderSections`),
  // List/Grid show every document flat (`filteredSortedDocuments`). Checking
  // the wrong one could show an empty state over real results (or vice
  // versa) whenever a search matches something only the other view would
  // display.
  const noMatches =
    !loading &&
    totalCount > 0 &&
    query.trim() !== '' &&
    (viewMode === 'folder'
      ? folderSections.length === 0
      : filteredSortedDocuments.length === 0);

  return (
    <View style={styles.container}>
      <View style={[styles.centeredContent, {maxWidth: contentMaxWidth}]}>
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
          <View style={[styles.heroHeader, {paddingTop: insets.top + 10}]}>
            <Text style={styles.heroTitle}>All Files</Text>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Icon name="search" size={20} color="rgba(255,255,255,0.75)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search files"
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            </View>
          </View>

          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {documents.length} file{documents.length === 1 ? '' : 's'}
            </Text>
            <TouchableOpacity
              onPress={handleCreateFolder}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon
                name="folder-plus-outline"
                family="community"
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewSheetVisible(true)}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon
                name={VIEW_OPTIONS.find(o => o.key === viewMode)!.icon}
                family={VIEW_OPTIONS.find(o => o.key === viewMode)!.family}
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortSheetVisible(true)}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon
                name="swap-vertical"
                family="community"
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectionMode(true)}
              hitSlop={6}
              style={styles.sectionIconBtn}>
              <Icon
                name="checkbox-marked-outline"
                family="community"
                size={20}
                color={colors.text}
              />
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
        ) : viewMode === 'grid' ? (
          <FlatList
            key={`grid-${gridColumns}`}
            data={filteredSortedDocuments}
            keyExtractor={item => item.id}
            numColumns={gridColumns}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.accent]}
                tintColor={colors.accent}
              />
            }
            renderItem={({item, index}) => (
              <DocumentCard
                document={item}
                index={index}
                onPress={() => handleDocPress(item)}
                onLongPress={() => handleDocLongPress(item)}
                selectionMode={selectionMode}
                selected={selectedIds.includes(item.id)}
                widthPercent={cardWidthPercent}
                showSyncStatus={driveConnected}
                thumbnailUri={thumbnails[item.id]}
              />
            )}
          />
        ) : viewMode === 'list' ? (
          <FlatList
            key="list"
            data={filteredSortedDocuments}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.accent]}
                tintColor={colors.accent}
              />
            }
            renderItem={({item, index}) => (
              <DocumentListRow
                document={item}
                index={index}
                onPress={() => handleDocPress(item)}
                onLongPress={() => handleDocLongPress(item)}
                selectionMode={selectionMode}
                selected={selectedIds.includes(item.id)}
                showSyncStatus={driveConnected}
                thumbnailUri={thumbnails[item.id]}
                onMore={
                  selectionMode ? undefined : () => setMoreMenuDoc(item)
                }
              />
            )}
          />
        ) : (
          <SectionList
            key="folder"
            sections={displaySections}
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
            renderSectionHeader={({section}) => {
              const collapsed = collapsedFolders.has(
                section.folderId ?? ROOT_SECTION_KEY,
              );
              return (
                <TouchableOpacity
                  style={styles.sectionHeader}
                  activeOpacity={0.7}
                  onPress={() =>
                    section.folder
                      ? handleToggleFolderSection(section.folder)
                      : toggleFolderCollapsed(null)
                  }
                  onLongPress={() => {
                    if (section.folder) {
                      handleFolderLongPress(section.folder);
                    }
                  }}>
                  <Icon
                    name="folder-outline"
                    family="community"
                    size={18}
                    color={
                      section.folderId === null ? colors.textMuted : colors.accent
                    }
                  />
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  {section.folder?.isLocked && (
                    <Icon name="lock" size={14} color={colors.textMuted} />
                  )}
                  <Text style={styles.sectionHeaderCount}>
                    {sectionCounts.get(section.folderId ?? ROOT_SECTION_KEY) ?? 0}
                  </Text>
                  <Icon
                    name={collapsed ? 'chevron-right' : 'expand-more'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              );
            }}
            renderItem={({item, index, section}) => {
              const row = (
                <DocumentListRow
                  document={item}
                  index={index}
                  onPress={() => handleDocPress(item)}
                  onLongPress={() => handleDocLongPress(item)}
                  selectionMode={selectionMode}
                  selected={selectedIds.includes(item.id)}
                  showSyncStatus={driveConnected}
                  thumbnailUri={thumbnails[item.id]}
                  onMore={
                    selectionMode ? undefined : () => setMoreMenuDoc(item)
                  }
                />
              );
              // Nests a document under its folder's header with a thin
              // connector line, same as Home's folder-grouped list -
              // unfiled ("No Folder") documents render flat instead.
              return section.folderId !== null ? (
                <View style={styles.folderDocWrap}>
                  <View style={styles.folderDocLine} />
                  <View style={styles.folderDocRow}>{row}</View>
                </View>
              ) : (
                row
              );
            }}
          />
        )}
      </View>
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
        visible={viewSheetVisible}
        title="View"
        options={VIEW_OPTIONS}
        selectedKey={viewMode}
        onSelect={applyView}
        onClose={() => setViewSheetVisible(false)}
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
    // Caps the title/search/list column at a readable width and centers it
    // on large tablets - full edge-to-edge rows there left a wide dead gap
    // between the folder/document icon and the chevron on the far right.
    centeredContent: {
      flex: 1,
      width: '100%',
      alignSelf: 'center',
    },
    heroHeader: {
      backgroundColor: colors.accent,
      paddingBottom: 16,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.white,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.white,
      padding: 0,
    },
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 6,
    },
    countText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
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
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      marginTop: 6,
    },
    sectionHeaderText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    sectionHeaderCount: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    folderDocWrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    folderDocLine: {
      width: 2,
      borderRadius: 1,
      backgroundColor: colors.border,
      marginRight: 10,
      marginBottom: 10,
    },
    folderDocRow: {
      flex: 1,
    },
    listArea: {
      flex: 1,
    },
    list: {
      padding: 16,
      paddingBottom: 24,
    },
    gridRow: {
      justifyContent: 'space-between',
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
