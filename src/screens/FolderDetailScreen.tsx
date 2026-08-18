import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Alert from '../utils/customAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/Icon';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {DocumentSummary, Folder} from '../types/models';
import {
  deleteDocument,
  listDocuments,
  listFolders,
  moveDocumentToFolder,
  renameDocument,
} from '../db/database';
import {deleteDocumentFiles} from '../services/fileStorage';
import DocumentCard from '../components/DocumentCard';
import DocumentListRow from '../components/DocumentListRow';
import Fab from '../components/Fab';
import FolderPickerModal from '../components/FolderPickerModal';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {promptForText} from '../utils/promptForText';
import {percentWidth, useResponsive} from '../utils/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'FolderDetail'>;
type ViewMode = 'grid' | 'list';

const VIEW_MODE_KEY = 'lavati_home_view_mode';

export default function FolderDetailScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {gridColumns} = useResponsive();
  const cardWidthPercent = percentWidth(100 / gridColumns - 3);
  const insets = useSafeAreaInsets();
  const {folderId} = route.params;
  const [folder, setFolder] = useState<Folder | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingDoc, setMovingDoc] = useState<DocumentSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(saved => {
      if (saved === 'grid' || saved === 'list') {
        setViewMode(saved);
      }
    });
  }, []);

  function toggleViewMode() {
    const next: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    AsyncStorage.setItem(VIEW_MODE_KEY, next);
  }

  const load = useCallback(async () => {
    const [folders, docs] = await Promise.all([
      listFolders(),
      listDocuments(folderId),
    ]);
    setFolder(folders.find(f => f.id === folderId) ?? null);
    setDocuments(docs);
    setLoading(false);
  }, [folderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({title: folder?.name ?? 'Folder'});
  }, [navigation, folder]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleNewScan() {
    navigation.navigate('Scan', {folderId});
  }

  function handleLongPress(doc: DocumentSummary) {
    Alert.alert(doc.name, undefined, [
      {text: 'Rename', onPress: () => handleRename(doc)},
      {text: 'Move to Folder', onPress: () => setMovingDoc(doc)},
      {text: 'Delete', style: 'destructive', onPress: () => handleDelete(doc)},
      {text: 'Cancel', style: 'cancel'},
    ]);
  }

  async function handleRename(doc: DocumentSummary) {
    const name = await promptForText('Rename document', doc.name);
    if (name && name.trim()) {
      await renameDocument(doc.id, name.trim());
      load();
    }
  }

  async function handleMoveToFolder(folderId: string | null) {
    if (movingDoc) {
      await moveDocumentToFolder(movingDoc.id, folderId);
      setMovingDoc(null);
      load();
    }
  }

  function handleDelete(doc: DocumentSummary) {
    Alert.alert('Delete document', `Delete "${doc.name}"?`, [
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

  if (loading) {
    return null;
  }

  return (
    <View style={styles.container}>
      {documents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Icon name="folder-open" size={36} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>Folder is empty</Text>
          <Text style={styles.emptySubtitle}>
            Scan a document into this folder.
          </Text>
        </View>
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${gridColumns}`}
          data={documents}
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
              onPress={() =>
                navigation.navigate('DocumentDetail', {docId: item.id})
              }
              onLongPress={() => handleLongPress(item)}
              widthPercent={cardWidthPercent}
            />
          )}
        />
      ) : (
        <FlatList
          key="list"
          data={documents}
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
              onPress={() =>
                navigation.navigate('DocumentDetail', {docId: item.id})
              }
              onLongPress={() => handleLongPress(item)}
            />
          )}
        />
      )}
      <Fab
        onPress={toggleViewMode}
        icon={viewMode === 'grid' ? 'view-list' : 'grid-view'}
        variant="secondary"
        size={46}
        bottom={92 + insets.bottom}
      />
      <Fab
        onPress={handleNewScan}
        icon="photo-camera"
        bottom={24 + insets.bottom}
      />

      <FolderPickerModal
        visible={movingDoc !== null}
        currentFolderId={movingDoc?.folderId}
        onClose={() => setMovingDoc(null)}
        onPick={handleMoveToFolder}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      padding: 16,
    },
    row: {
      justifyContent: 'space-between',
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
