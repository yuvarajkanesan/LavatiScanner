import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Share from 'react-native-share';
import {useFocusEffect} from '@react-navigation/native';
import {TabScreenProps} from '../navigation/types';
import {DocumentSummary, Folder} from '../types/models';
import {
  addPage as addPageRecord,
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  listDocuments,
  listFolders,
  listPages,
  moveDocumentToFolder,
  renameDocument,
  searchDocumentsByText,
} from '../db/database';
import {copyPageFile, deleteDocumentFiles} from '../services/fileStorage';
import {
  buildPdfFromImages,
  parsePageOcrBlocks,
} from '../services/pdfExport';
import {
  importFilesAsDocuments,
  importGalleryImagesAsDocuments,
} from '../services/importFiles';
import {isGoogleDriveSignedIn} from '../services/googleDrive';
import {getThumbnail} from '../services/nativeImageFilter';
import {mapWithConcurrency} from '../utils/concurrency';
import DocumentCard from '../components/DocumentCard';
import DocumentListRow from '../components/DocumentListRow';
import FirstLaunchTips, {hasSeenTips} from '../components/FirstLaunchTips';
import FolderPickerModal from '../components/FolderPickerModal';
import OptionSheet, {SheetOption} from '../components/OptionSheet';
import Icon, {IconFamily} from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import ScreenBackground from '../components/ScreenBackground';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {scanTimestampName} from '../utils/format';
import {promptForText} from '../utils/promptForText';
import {percentWidth, useResponsive} from '../utils/responsive';

type Props = TabScreenProps<'Home'>;

type ViewMode = 'grid' | 'list' | 'folder';
type SortMode =
  | 'name_asc'
  | 'name_desc'
  | 'created_desc'
  | 'created_asc'
  | 'modified_desc'
  | 'modified_asc';
type FolderAction = 'move' | 'copy' | null;
type BulkBusy = 'delete' | 'merge' | 'share' | 'copy' | 'move' | null;

interface FolderSection {
  title: string;
  folderId: string | null;
  data: DocumentSummary[];
}

const VIEW_MODE_KEY = 'lavati_home_view_mode';
const SORT_MODE_KEY = 'lavati_home_sort_mode';
/** Sentinel key for the "No Folder" section in collapse-state tracking, since its folderId is null. */
const ROOT_SECTION_KEY = '__root__';

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

const SORT_MODE_KEYS: SortMode[] = SORT_OPTIONS.map(o => o.key as SortMode);

export default function HomeScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {gridColumns} = useResponsive();
  const cardWidthPercent = percentWidth(100 / gridColumns - 3);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [contentMatchIds, setContentMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('modified_desc');
  const [viewSheetVisible, setViewSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [importSheetVisible, setImportSheetVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folderAction, setFolderAction] = useState<FolderAction>(null);
  const [bulkBusy, setBulkBusy] = useState<BulkBusy>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [driveConnected, setDriveConnected] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [deletableFolderId, setDeletableFolderId] = useState<string | null>(
    null,
  );
  const [moreMenuDoc, setMoreMenuDoc] = useState<DocumentSummary | null>(
    null,
  );
  const [importingTray, setImportingTray] = useState<
    'import' | 'images' | null
  >(null);
  const [showTips, setShowTips] = useState(false);
  // `any`-typed: RN 0.87's TextInput ref type doesn't line up cleanly with
  // the Inter-font Metro shim's forwardRef wrapper for a plain instance
  // ref here - only `.focus()` is needed, so the precise type isn't worth
  // fighting.
  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    hasSeenTips().then(seen => {
      if (!seen) {
        setShowTips(true);
      }
    });
  }, []);

  // One-shot action requested by a deep link (app-icon shortcut, Quick
  // Settings tile, widget) - consumed immediately via setParams so it
  // doesn't re-fire the next time this tab is simply refocused.
  useEffect(() => {
    const action = route.params?.autoAction;
    if (!action) {
      return;
    }
    navigation.setParams({autoAction: undefined});
    if (action === 'import') {
      handleImportFilesTray();
    } else if (action === 'search') {
      searchInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoAction]);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(saved => {
      if (saved === 'grid' || saved === 'list' || saved === 'folder') {
        setViewMode(saved);
      }
    });
    AsyncStorage.getItem(SORT_MODE_KEY).then(saved => {
      if (saved && (SORT_MODE_KEYS as string[]).includes(saved)) {
        setSortMode(saved as SortMode);
      }
    });
  }, []);

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

  function applyView(next: string) {
    setViewMode(next as ViewMode);
    AsyncStorage.setItem(VIEW_MODE_KEY, next);
  }

  function applySort(next: string) {
    setSortMode(next as SortMode);
    AsyncStorage.setItem(SORT_MODE_KEY, next);
  }

  const filteredDocuments = useMemo(() => {
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

  const folderSections = useMemo<FolderSection[]>(() => {
    const byFolder = new Map<string | null, DocumentSummary[]>();
    for (const doc of filteredDocuments) {
      const key = doc.folderId;
      if (!byFolder.has(key)) {
        byFolder.set(key, []);
      }
      byFolder.get(key)!.push(doc);
    }
    const sections: FolderSection[] = [];
    for (const folder of folders) {
      const docs = byFolder.get(folder.id);
      if (docs?.length) {
        sections.push({title: folder.name, folderId: folder.id, data: docs});
      }
    }
    const rootDocs = byFolder.get(null);
    if (rootDocs?.length) {
      sections.push({title: 'No Folder', folderId: null, data: rootDocs});
    }
    return sections;
  }, [filteredDocuments, folders]);

  const displaySections = useMemo(
    () =>
      folderSections.map(section =>
        collapsedFolders.has(section.folderId ?? ROOT_SECTION_KEY)
          ? {...section, data: []}
          : section,
      ),
    [folderSections, collapsedFolders],
  );

  // Collapsed sections have their `data` zeroed out for SectionList, so the
  // header's document count is looked up here instead (from the un-collapsed
  // folderSections) rather than read off section.data.length.
  const sectionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of folderSections) {
      map.set(section.folderId ?? ROOT_SECTION_KEY, section.data.length);
    }
    return map;
  }, [folderSections]);

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

  const selectedDocuments = useMemo(
    () => documents.filter(d => selectedIds.includes(d.id)),
    [documents, selectedIds],
  );

  /** Resolves each document's small cached thumbnail in the background
   * (never blocks the screen from showing) - see `getThumbnail`'s doc
   * comment for why this exists: without it every card/row decodes a
   * full-resolution scan just to show it a few hundred pixels wide, which
   * is the main thing that made scrolling (and everything else, via GC
   * pressure) feel slow. */
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
    const [docs, folderList] = await Promise.all([
      listDocuments('all'),
      listFolders(),
    ]);
    setDocuments(docs);
    setFolders(folderList);
    setDriveConnected(isGoogleDriveSignedIn());
    setLoading(false);
    resolveThumbnails(docs);
  }, [resolveThumbnails]);

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

  function handleNewScan() {
    navigation.navigate('Scan', {folderId: null});
  }

  async function handleImportFilesTray() {
    try {
      setImportingTray('import');
      const {createdDocIds, skipped} = await importFilesAsDocuments(null);
      if (createdDocIds.length === 0) {
        if (skipped.length > 0) {
          Alert.alert(
            'Import failed',
            `Could not open: ${skipped.join(
              ', ',
            )}. The file may be password-protected.`,
          );
        }
        return;
      }
      if (skipped.length > 0) {
        Alert.alert(
          'Some files skipped',
          `Could not open: ${skipped.join(
            ', ',
          )}. The rest were imported as separate documents.`,
        );
      }
      await load();
      if (createdDocIds.length === 1) {
        navigation.navigate('DocumentDetail', {docId: createdDocIds[0]});
      }
    } catch (error) {
      Alert.alert('Import failed', 'Could not import the selected files.');
    } finally {
      setImportingTray(null);
    }
  }

  async function handleImportImagesTray() {
    try {
      setImportingTray('images');
      const {createdDocIds} = await importGalleryImagesAsDocuments(null);
      if (createdDocIds.length === 0) {
        return;
      }
      await load();
      if (createdDocIds.length === 1) {
        navigation.navigate('DocumentDetail', {docId: createdDocIds[0]});
      }
    } catch (error) {
      Alert.alert('Import failed', 'Could not import the selected images.');
    } finally {
      setImportingTray(null);
    }
  }

  async function handleShareSingleDocument(doc: DocumentSummary) {
    try {
      const pages = await listPages(doc.id);
      if (pages.length === 0) {
        return;
      }
      const pdfPath = await buildPdfFromImages(
        pages.map(p => p.filePath),
        doc.name,
        pages.map(p => parsePageOcrBlocks(p.ocrBlocks)),
      );
      await Share.open({
        url: `file://${pdfPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert(
        'Share failed',
        'Could not prepare this document for sharing.',
      );
    }
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

  async function handleCreateFolder() {
    const name = await promptForText('New folder', '');
    if (name && name.trim()) {
      const folder = await createFolder(name.trim());
      navigation.navigate('FolderDetail', {folderId: folder.id});
    }
  }

  function handleDeleteFolder(folderId: string, folderName: string) {
    Alert.alert(
      'Delete folder',
      `Delete "${folderName}"? Documents inside will move to the root.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setDeletableFolderId(null),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletableFolderId(null);
            await deleteFolder(folderId);
            load();
          },
        },
      ],
    );
  }

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

  function handleCardPress(doc: DocumentSummary) {
    if (selectionMode) {
      toggleSelected(doc.id);
    } else {
      navigation.navigate('DocumentDetail', {docId: doc.id});
    }
  }

  function handleCardLongPress(doc: DocumentSummary) {
    if (selectionMode) {
      toggleSelected(doc.id);
    } else {
      setSelectionMode(true);
      setSelectedIds([doc.id]);
    }
  }

  function handleSelectAll() {
    if (selectedIds.length === filteredDocuments.length) {
      setSelectedIds([]);
      setSelectionMode(false);
    } else {
      setSelectedIds(filteredDocuments.map(d => d.id));
    }
  }

  // ---------- Bulk actions ----------

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

  const currentViewOption = VIEW_OPTIONS.find(o => o.key === viewMode)!;

  const moreMenuOptions: SheetOption[] = [
    {key: 'share', label: 'Share', icon: 'share'},
    {key: 'rename', label: 'Rename', icon: 'edit'},
    {key: 'move', label: 'Move / Copy', icon: 'drive-file-move'},
    {key: 'delete', label: 'Delete', icon: 'delete-outline', color: colors.danger},
  ];

  const importOptions: SheetOption[] = [
    {key: 'files', label: 'Import Files', icon: 'file-upload'},
    {key: 'images', label: 'Import Images', icon: 'image'},
  ];

  return (
    <ScreenBackground>
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
              {selectedIds.length === filteredDocuments.length
                ? 'Deselect All'
                : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.heroHeader}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Icon name="search" size={20} color="rgba(255,255,255,0.75)" />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search documents"
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            </View>
          </View>

          <View style={styles.quickActionsCard}>
            <QuickAction
              icon="line-scan"
              family="community"
              label="Scan"
              onPress={handleNewScan}
            />
            <QuickAction
              icon="card-account-details-outline"
              label="ID card"
              onPress={() =>
                navigation.navigate('Scan', {folderId: null, mode: 'idcard'})
              }
            />
            <QuickAction
              icon="file-import-outline"
              label="Import"
              onPress={() => setImportSheetVisible(true)}
            />
            <QuickAction
              icon="signature-freehand"
              label="Sign"
              onPress={() => navigation.navigate('SignPdf')}
            />
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>
              My Scans{documents.length > 0 ? ` (${documents.length})` : ''}
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
                name={currentViewOption.icon}
                family={currentViewOption.family}
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
      ) : documents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrapLarge}>
            <Icon
              name="line-scan"
              family="community"
              size={56}
              color={colors.accent}
            />
          </View>
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan a document, or import a file or photo to get started.
          </Text>
          <TouchableOpacity
            style={styles.emptyPrimaryBtn}
            onPress={handleNewScan}
            activeOpacity={0.85}>
            <Icon
              name="line-scan"
              family="community"
              size={20}
              color={colors.white}
            />
            <Text style={styles.emptyPrimaryBtnText}>Scan document</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptySecondaryBtn}
            onPress={handleImportFilesTray}
            activeOpacity={0.7}>
            <Icon
              name="file-import-outline"
              family="community"
              size={18}
              color={colors.accent}
            />
            <Text style={styles.emptySecondaryBtnText}>Import files</Text>
          </TouchableOpacity>
        </View>
      ) : filteredDocuments.length === 0 ? (
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
          data={filteredDocuments}
          keyExtractor={item => item.id}
          numColumns={gridColumns}
          columnWrapperStyle={styles.row}
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
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
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
          data={filteredDocuments}
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
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
              showSyncStatus={driveConnected}
              thumbnailUri={thumbnails[item.id]}
              onMore={() => setMoreMenuDoc(item)}
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
                onPress={() => {
                  setDeletableFolderId(null);
                  toggleFolderCollapsed(section.folderId);
                }}
                onLongPress={() => {
                  if (section.folderId !== null) {
                    setDeletableFolderId(section.folderId);
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
                <Text style={styles.sectionHeaderCount}>
                  {sectionCounts.get(section.folderId ?? ROOT_SECTION_KEY) ?? 0}
                </Text>
                {section.folderId !== null &&
                  deletableFolderId === section.folderId && (
                    <TouchableOpacity
                      onPress={e => {
                        e.stopPropagation();
                        handleDeleteFolder(
                          section.folderId as string,
                          section.title,
                        );
                      }}
                      hitSlop={8}
                      style={styles.sectionHeaderDeleteBtn}>
                      <Icon
                        name="delete-outline"
                        size={18}
                        color={colors.danger}
                      />
                    </TouchableOpacity>
                  )}
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
                onPress={() => handleCardPress(item)}
                onLongPress={() => handleCardLongPress(item)}
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
            // connector line - unfiled ("No Folder") documents render flat.
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

      {selectionMode ? (
        <View style={styles.bulkBar}>
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
      ) : null}

      <FolderPickerModal
        visible={folderAction !== null}
        onClose={() => setFolderAction(null)}
        onPick={handleFolderPicked}
      />

      <OptionSheet
        visible={viewSheetVisible}
        title="View By"
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
          if (key === 'share') {
            const doc = moreMenuDoc;
            setMoreMenuDoc(null);
            if (doc) {
              handleShareSingleDocument(doc);
            }
          } else if (key === 'rename') {
            handleRenameFromMenu();
          } else if (key === 'move') {
            handleMoveFromMenu();
          } else if (key === 'delete') {
            handleDeleteFromMenu();
          }
        }}
        onClose={() => setMoreMenuDoc(null)}
      />
      <OptionSheet
        visible={importSheetVisible}
        title="Import"
        options={importOptions}
        selectedKey=""
        onSelect={key => {
          setImportSheetVisible(false);
          if (key === 'files') {
            handleImportFilesTray();
          } else if (key === 'images') {
            handleImportImagesTray();
          }
        }}
        onClose={() => setImportSheetVisible(false)}
      />
      {showTips && <FirstLaunchTips onDone={() => setShowTips(false)} />}
    </ScreenBackground>
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

function QuickAction({
  icon,
  family = 'community',
  label,
  onPress,
}: {
  icon: string;
  family?: IconFamily;
  label: string;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <FeatureBadge
        icon={icon}
        family={family}
        color={colors.accent}
        size={46}
        variant="soft"
      />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    heroHeader: {
      backgroundColor: colors.accent,
      paddingTop: 6,
      paddingBottom: 38,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
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
    quickActionsCard: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: -26,
      borderRadius: 18,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    quickAction: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    quickActionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 20,
      marginBottom: 6,
    },
    sectionTitle: {
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
    listArea: {
      flex: 1,
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
    list: {
      padding: 16,
      paddingBottom: 24,
    },
    row: {
      justifyContent: 'space-between',
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
    sectionHeaderDeleteBtn: {
      padding: 4,
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
    emptyIconWrapLarge: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
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
    emptyPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 24,
      paddingHorizontal: 28,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.accent,
    },
    emptyPrimaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    emptySecondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 14,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    emptySecondaryBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.accent,
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
