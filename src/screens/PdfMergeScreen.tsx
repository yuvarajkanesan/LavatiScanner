import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import Share from 'react-native-share';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {DocumentSummary} from '../types/models';
import {listDocuments, listPages} from '../db/database';
import {
  getPdfPageCount,
  isPdfRenderable,
  mergeMixedToPdf,
  MergeSource,
} from '../services/pdfEdit';
import {pickPdfFiles} from '../services/documentPicker';
import {renderAllPdfPages, renderPdfPage} from '../services/pdfThumbnail';
import {saveSessionAsDocument} from '../services/scanPipeline';
import {promptForText} from '../utils/promptForText';
import {scanTimestampName} from '../utils/format';
import Icon from '../components/Icon';
import FolderPickerModal from '../components/FolderPickerModal';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfMerge'>;

interface QueueItem {
  key: string;
  type: 'doc' | 'pdf';
  docId?: string;
  uri?: string;
  name: string;
  pageCount: number;
  thumbUri: string | null;
}

export default function PdfMergeScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [addingPdf, setAddingPdf] = useState(false);
  const [merging, setMerging] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [pendingSave, setPendingSave] = useState<
    {pdfPath: string; name: string} | null
  >(null);

  const totalPages = useMemo(
    () => queue.reduce((sum, item) => sum + item.pageCount, 0),
    [queue],
  );

  const load = useCallback(async () => {
    setDocuments(await listDocuments('all'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Warn before leaving with a non-empty merge queue that was never turned
  // into an actual output — same beforeRemove-interception pattern as
  // PdfEditorScreen.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      if (queue.length === 0) {
        return;
      }
      e.preventDefault();
      Alert.alert(
        'Discard merge queue?',
        'You have documents queued to merge. Leaving now will clear the queue.',
        [
          {text: 'Keep Queue', style: 'cancel'},
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, queue]);

  function toggleDocument(doc: DocumentSummary) {
    setQueue(prev => {
      const exists = prev.find(q => q.type === 'doc' && q.docId === doc.id);
      if (exists) {
        return prev.filter(q => q !== exists);
      }
      return [
        ...prev,
        {
          key: `doc-${doc.id}`,
          type: 'doc',
          docId: doc.id,
          name: doc.name,
          pageCount: doc.pageCount,
          thumbUri: doc.thumbnailPath ? `file://${doc.thumbnailPath}` : null,
        },
      ];
    });
  }

  async function handleAddPdfFiles() {
    try {
      setAddingPdf(true);
      const picked = await pickPdfFiles();
      for (const file of picked) {
        const pageCount = await getPdfPageCount(file.uri);
        let thumbUri: string | null = null;
        if (await isPdfRenderable(file.uri)) {
          try {
            thumbUri = (await renderPdfPage(file.uri, 0)).uri;
          } catch {
            thumbUri = null;
          }
        }
        setQueue(prev => [
          ...prev,
          {
            key: `pdf-${file.uri}-${prev.length}`,
            type: 'pdf',
            uri: file.uri,
            name: file.name,
            pageCount,
            thumbUri,
          },
        ]);
      }
    } catch (error) {
      Alert.alert(
        'Could not add file',
        'One of the selected PDFs may be password-protected or corrupted.',
      );
    } finally {
      setAddingPdf(false);
    }
  }

  function removeFromQueue(key: string) {
    setQueue(prev => prev.filter(q => q.key !== key));
  }

  async function handleMerge() {
    if (queue.length < 2) {
      return;
    }
    const defaultName = `Merged_${scanTimestampName()}`;
    const name = await promptForText('Name this PDF', defaultName);
    if (name === null) {
      return;
    }
    const outputName = name.trim() || defaultName;
    try {
      setMerging(true);
      const sources: MergeSource[] = [];
      for (const item of queue) {
        if (item.type === 'doc' && item.docId) {
          const pages = await listPages(item.docId);
          if (pages.length > 0) {
            sources.push({
              type: 'images',
              filePaths: pages.map(p => p.filePath),
            });
          }
        } else if (item.type === 'pdf' && item.uri) {
          sources.push({type: 'pdf', uri: item.uri});
        }
      }
      if (sources.length === 0) {
        Alert.alert('Nothing to merge', 'The selected items have no pages.');
        return;
      }
      const pdfPath = await mergeMixedToPdf(sources, outputName);
      Alert.alert(
        `Merged (${totalPages} pages)`,
        'What would you like to do with it?',
        [
          {
            text: 'Save to Documents',
            onPress: () => {
              setPendingSave({pdfPath, name: outputName});
              setFolderPickerVisible(true);
            },
          },
          {text: 'Share', onPress: () => handleShareMerged(pdfPath)},
          {text: 'Cancel', style: 'cancel'},
        ],
      );
    } catch (error) {
      Alert.alert('Merge failed', 'Could not merge the selected items.');
    } finally {
      setMerging(false);
    }
  }

  async function handleShareMerged(pdfPath: string) {
    try {
      await Share.open({
        url: `file://${pdfPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
      setQueue([]);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Share failed', 'Could not share the merged PDF.');
    }
  }

  async function handleSaveMergedToDocuments(folderId: string | null) {
    setFolderPickerVisible(false);
    const pending = pendingSave;
    setPendingSave(null);
    if (!pending) {
      return;
    }
    try {
      setMerging(true);
      const rendered = await renderAllPdfPages(pending.pdfPath);
      const docId = await saveSessionAsDocument({
        docName: pending.name,
        folderId,
        pages: rendered.map((r, i) => ({
          id: `p${i}`,
          rawUri: r.uri,
          filter: 'original',
        })),
      });
      setQueue([]);
      navigation.replace('DocumentDetail', {docId});
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the merged PDF.');
    } finally {
      setMerging(false);
    }
  }

  return (
    <View style={styles.container}>
      {queue.length > 0 && (
        <View style={styles.queueSection}>
          <Text style={styles.sectionLabel}>
            Merge order · drag to reorder · {queue.length} item
            {queue.length === 1 ? '' : 's'} · {totalPages} page
            {totalPages === 1 ? '' : 's'}
          </Text>
          <DraggableFlatList
            data={queue}
            keyExtractor={item => item.key}
            horizontal
            contentContainerStyle={styles.queueList}
            onDragEnd={({data}) => setQueue(data)}
            renderItem={({
              item,
              drag,
              isActive,
            }: RenderItemParams<QueueItem>) => (
              <ScaleDecorator>
                <TouchableOpacity
                  style={[styles.queueCard, isActive && styles.queueCardActive]}
                  onLongPress={drag}
                  disabled={isActive}
                  activeOpacity={0.9}>
                  {item.thumbUri ? (
                    <Image
                      source={{uri: item.thumbUri}}
                      style={styles.queueThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.queueThumb}>
                      <Icon
                        name={
                          item.type === 'pdf' ? 'picture-as-pdf' : 'description'
                        }
                        size={18}
                        color={colors.accent}
                      />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.queueRemove}
                    hitSlop={6}
                    onPress={() => removeFromQueue(item.key)}>
                    <Icon name="close" size={12} color={colors.white} />
                  </TouchableOpacity>
                  <Text style={styles.queueCardText} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.queueCardPages}>
                    {item.pageCount} page{item.pageCount === 1 ? '' : 's'}
                  </Text>
                </TouchableOpacity>
              </ScaleDecorator>
            )}
          />
        </View>
      )}

      <View style={styles.sourceHeader}>
        <Text style={styles.hint}>
          Tap documents to add them, or bring in any PDF file from your device.
        </Text>
        <TouchableOpacity
          style={styles.addPdfBtn}
          onPress={handleAddPdfFiles}
          disabled={addingPdf}>
          {addingPdf ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Icon name="file-upload" size={16} color={colors.accent} />
              <Text style={styles.addPdfBtnText}>Add PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => {
          const isSelected = queue.some(
            q => q.type === 'doc' && q.docId === item.id,
          );
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => toggleDocument(item)}
              activeOpacity={0.7}>
              <View
                style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && (
                  <Icon name="check" size={14} color={colors.white} />
                )}
              </View>
              {item.thumbnailPath ? (
                <Image
                  source={{uri: `file://${item.thumbnailPath}`}}
                  style={styles.thumb}
                />
              ) : (
                <View style={styles.thumb} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSubtitle}>{item.pageCount} pages</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[
            styles.mergeButton,
            queue.length < 2 && styles.mergeButtonDisabled,
          ]}
          disabled={queue.length < 2 || merging}
          onPress={handleMerge}>
          {merging ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon name="call-merge" size={18} color={colors.white} />
              <Text style={styles.mergeButtonText}>
                Merge {queue.length > 0 ? `(${queue.length})` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FolderPickerModal
        visible={folderPickerVisible}
        onClose={() => {
          setFolderPickerVisible(false);
          setPendingSave(null);
        }}
        onPick={handleSaveMergedToDocuments}
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
    queueSection: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 12,
      marginLeft: 16,
      marginBottom: 8,
    },
    queueList: {
      paddingHorizontal: 16,
      gap: 10,
    },
    queueCard: {
      width: 72,
      marginRight: 10,
    },
    queueCardActive: {
      opacity: 0.8,
    },
    queueThumb: {
      width: 72,
      height: 92,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    queueRemove: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    queueCardText: {
      marginTop: 4,
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
    },
    queueCardPages: {
      fontSize: 9,
      color: colors.textMuted,
      opacity: 0.75,
      textAlign: 'center',
    },
    sourceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 10,
    },
    hint: {
      flex: 1,
      fontSize: 13,
      color: colors.textMuted,
    },
    addPdfBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.accentMuted,
    },
    addPdfBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
    list: {
      padding: 16,
      paddingTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    thumb: {
      width: 40,
      height: 52,
      borderRadius: 5,
      backgroundColor: colors.border,
    },
    rowText: {
      flex: 1,
      marginLeft: 12,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
    },
    actionBar: {
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    mergeButton: {
      height: 48,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
    },
    mergeButtonDisabled: {
      opacity: 0.5,
    },
    mergeButtonText: {
      color: colors.white,
      fontWeight: '700',
    },
  });
