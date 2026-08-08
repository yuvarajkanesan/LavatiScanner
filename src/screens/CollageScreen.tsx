import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import Share from 'react-native-share';
import {captureRef} from 'react-native-view-shot';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {listDocuments, listPages} from '../db/database';
import {DocumentSummary, Page} from '../types/models';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

const MAX_PAGES = 6;

type Props = NativeStackScreenProps<RootStackParamList, 'Collage'>;

export default function CollageScreen({route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docPages, setDocPages] = useState<Page[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const collageRef = useRef<View>(null);

  const load = useCallback(async () => {
    const docs = await listDocuments('all');
    setDocuments(docs);
    const wantedDocId = route.params?.docId;
    if (wantedDocId && selectedDocId === null) {
      const wanted = docs.find(d => d.id === wantedDocId);
      if (wanted) {
        await selectDocument(wanted);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.docId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function selectDocument(doc: DocumentSummary) {
    setSelectedDocId(doc.id);
    setSelectedPageIds([]);
    setDocPages(await listPages(doc.id));
  }

  function togglePage(pageId: string) {
    setSelectedPageIds(prev => {
      if (prev.includes(pageId)) {
        return prev.filter(id => id !== pageId);
      }
      if (prev.length >= MAX_PAGES) {
        return prev;
      }
      return [...prev, pageId];
    });
  }

  const selectedPages = docPages.filter(p => selectedPageIds.includes(p.id));
  const columns =
    selectedPages.length <= 1 ? 1 : selectedPages.length <= 4 ? 2 : 3;

  async function handleCreateCollage(action: 'share' | 'gallery') {
    if (selectedPages.length < 2) {
      return;
    }
    try {
      setCreating(true);
      const collagePath = await captureRef(collageRef, {
        format: 'jpg',
        quality: 0.92,
      });
      if (action === 'share') {
        await Share.open({url: `file://${collagePath}`, failOnCancel: false});
      } else {
        await CameraRoll.saveAsset(collagePath, {
          type: 'photo',
          album: 'Lavati Scanner',
        });
        Alert.alert('Saved', 'The collage was saved to your gallery.');
      }
    } catch (error) {
      Alert.alert('Collage failed', 'Could not create the collage.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Pick a document, then tap up to {MAX_PAGES} pages to lay out in a
        collage.
      </Text>

      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.docList}
        renderItem={({item}) => {
          const active = item.id === selectedDocId;
          return (
            <TouchableOpacity
              style={[styles.docChip, active && styles.docChipActive]}
              onPress={() => selectDocument(item)}
              activeOpacity={0.8}>
              {item.thumbnailPath ? (
                <Image
                  source={{uri: `file://${item.thumbnailPath}`}}
                  style={styles.docThumb}
                />
              ) : (
                <View style={styles.docThumb} />
              )}
              <Text style={styles.docLabel} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {docPages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pageList}>
          {docPages.map((page, index) => {
            const selected = selectedPageIds.includes(page.id);
            return (
              <TouchableOpacity
                key={page.id}
                style={styles.pageChip}
                onPress={() => togglePage(page.id)}
                activeOpacity={0.8}>
                <Image
                  source={{uri: `file://${page.filePath}`}}
                  style={styles.pageThumb}
                />
                <View
                  style={[
                    styles.pageCheck,
                    selected && styles.pageCheckActive,
                  ]}>
                  {selected && (
                    <Icon name="check" size={12} color={colors.white} />
                  )}
                </View>
                <Text style={styles.pageLabel}>{index + 1}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.previewWrap}>
        {selectedPages.length >= 2 ? (
          <View
            ref={collageRef}
            collapsable={false}
            style={[styles.collage, {backgroundColor: colors.white}]}>
            {selectedPages.map(page => (
              <Image
                key={page.id}
                source={{uri: `file://${page.filePath}`}}
                style={[styles.collageCell, {width: `${100 / columns}%`}]}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : (
          <View style={styles.previewEmpty}>
            <Icon
              name="view-grid-plus-outline"
              family="community"
              size={40}
              color={colors.textMuted}
            />
            <Text style={styles.previewEmptyText}>
              Select at least 2 pages to preview the collage
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            selectedPages.length < 2 && styles.actionButtonDisabled,
          ]}
          onPress={() => handleCreateCollage('gallery')}
          disabled={selectedPages.length < 2 || creating}>
          {creating ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Icon
                name="image-move"
                family="community"
                size={18}
                color={colors.accent}
              />
              <Text style={[styles.actionButtonText, {color: colors.accent}]}>
                Save to Gallery
              </Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.actionButtonSolid,
            selectedPages.length < 2 && styles.actionButtonDisabled,
          ]}
          onPress={() => handleCreateCollage('share')}
          disabled={selectedPages.length < 2 || creating}>
          {creating ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon
                name="share-variant"
                family="community"
                size={18}
                color={colors.white}
              />
              <Text style={styles.actionButtonText}>Share Collage</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    hint: {
      padding: 16,
      paddingBottom: 8,
      fontSize: 13,
      color: colors.textMuted,
    },
    docList: {
      paddingHorizontal: 16,
      gap: 10,
    },
    docChip: {
      width: 84,
      marginRight: 10,
    },
    docChipActive: {
      opacity: 1,
    },
    docThumb: {
      width: 84,
      height: 108,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    docLabel: {
      marginTop: 6,
      fontSize: 11,
      color: colors.text,
      textAlign: 'center',
    },
    pageList: {
      paddingHorizontal: 16,
      paddingTop: 14,
      gap: 10,
    },
    pageChip: {
      width: 64,
      marginRight: 10,
      alignItems: 'center',
    },
    pageThumb: {
      width: 64,
      height: 82,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.white,
      backgroundColor: 'rgba(0,0,0,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageCheckActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pageLabel: {
      marginTop: 4,
      fontSize: 10,
      color: colors.textMuted,
    },
    previewWrap: {
      flex: 1,
      margin: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    collage: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    collageCell: {
      aspectRatio: 0.75,
    },
    previewEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 24,
    },
    previewEmptyText: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
    actionBar: {
      flexDirection: 'row',
      padding: 16,
      paddingTop: 0,
      gap: 10,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.accentMuted,
    },
    actionButtonSolid: {
      backgroundColor: colors.accent,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 13,
    },
  });
