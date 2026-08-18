import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
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
} from '../db/database';
import {copyPageFile, deleteDocumentFiles} from '../services/fileStorage';
import {buildPdfFromImages} from '../services/pdfExport';
import DocumentCard from '../components/DocumentCard';
import DocumentListRow from '../components/DocumentListRow';
import FolderPickerModal from '../components/FolderPickerModal';
import OptionSheet, {SheetOption} from '../components/OptionSheet';
import Fab from '../components/Fab';
import Icon from '../components/Icon';
import ScreenBackground from '../components/ScreenBackground';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {scanTimestampName} from '../utils/format';
import {promptForText} from '../utils/promptForText';
import {percentWidth, useResponsive} from '../utils/responsive';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

const VIEW_OPTIONS = [
  {key: 'grid', label: 'Grid', icon: 'grid-view'},
  {key: 'list', label: 'List', icon: 'view-list'},
  {key: 'folder', label: 'Folder View', icon: 'folder-open'},
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

export default function HomeScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {gridColumns} = useResponsive();
  const cardWidthPercent = percentWidth(100 / gridColumns - 3);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('modified_desc');
  const [viewSheetVisible, setViewSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folderAction, setFolderAction] = useState<FolderAction>(null);
  const [bulkBusy, setBulkBusy] = useState<BulkBusy>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [deletableFolderId, setDeletableFolderId] = useState<string | null>(
    null,
  );

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
      ? documents.filter(d => d.name.toLowerCase().includes(q))
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
  }, [documents, query, sortMode]);

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

  const load = useCallback(async () => {
    const [docs, folderList] = await Promise.all([
      listDocuments('all'),
      listFolders(),
    ]);
    setDocuments(docs);
    setFolders(folderList);
    setLoading(false);
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

  function handleNewScan() {
    navigation.navigate('Scan', {folderId: null});
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
      for (const doc of selectedDocuments) {
        const pages = await listPages(doc.id);
        allFilePaths.push(...pages.map(p => p.filePath));
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
          <View style={styles.topRow}>
            <Text style={styles.docCount}>All Docs ({documents.length})</Text>
            <NewScanButton onPress={handleNewScan} />
          </View>
          {documents.length > 0 && (
            <View style={styles.toolbar}>
              <View style={styles.searchBar}>
                <Icon name="search" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search your documents"
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            </View>
          )}
        </>
      )}

      {!loading && documents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Icon name="document-scanner" size={36} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the camera button to scan your first document.
          </Text>
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
          renderItem={({item}) => (
            <DocumentCard
              document={item}
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
              widthPercent={cardWidthPercent}
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
          renderItem={({item}) => (
            <DocumentListRow
              document={item}
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
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
                  name={section.folderId === null ? 'folder-off' : 'folder'}
                  size={18}
                  color={
                    section.folderId === null ? colors.textMuted : colors.gold
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
          renderItem={({item}) => (
            <DocumentListRow
              document={item}
              onPress={() => handleCardPress(item)}
              onLongPress={() => handleCardLongPress(item)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
            />
          )}
        />
      )}

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
      ) : (
        <>
          <Fab
            onPress={() => setViewSheetVisible(true)}
            icon={currentViewOption.icon}
            variant="secondary"
            size={46}
            bottom={140}
          />
          <Fab
            onPress={() => setSortSheetVisible(true)}
            icon="sort"
            variant="secondary"
            size={46}
            bottom={82}
          />
          <Fab
            onPress={handleCreateFolder}
            icon="create-new-folder"
            variant="secondary"
            size={46}
            bottom={24}
          />
        </>
      )}

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
    </ScreenBackground>
  );
}

function NewScanButton({onPress}: {onPress: () => void}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  return (
    <AnimatedPressable
      style={[styles.inlineCameraBtn, animatedStyle]}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, {damping: 15, stiffness: 400});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, {damping: 15, stiffness: 400});
      }}>
      <LinearGradient
        colors={colors.gradientPrimary}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.inlineCameraGradient}>
        <Icon name="photo-camera" size={28} color={colors.white} />
      </LinearGradient>
    </AnimatedPressable>
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
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
      marginHorizontal: 16,
    },
    docCount: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    inlineCameraBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      elevation: 5,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.28,
      shadowRadius: 6,
    },
    inlineCameraGradient: {
      width: '100%',
      height: '100%',
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 10,
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
