import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import RNFS from 'react-native-fs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import FilteredImage from '../components/FilteredImage';
import ZoomableImage from '../components/ZoomableImage';
import {FILTER_OPTIONS} from '../services/filters';
import {bakeFilterToFile} from '../services/nativeImageFilter';
import {rotateImageFile90} from '../services/pdfExport';
import {FilterType} from '../types/models';
import {
  appendSessionToDocument,
  saveSessionAsDocument,
} from '../services/scanPipeline';
import {generateId} from '../utils/ids';
import Icon from '../components/Icon';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Filter'>;

export default function FilterScreen({navigation, route}: Props) {
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const pageId = route.params?.pageId;
  const page = useMemo(
    () => session.pages.find(p => p.id === pageId),
    [session.pages, pageId],
  );
  const pageNumber = useMemo(
    () => session.pages.findIndex(p => p.id === pageId) + 1,
    [session.pages, pageId],
  );

  const [selectedFilter, setSelectedFilter] = useState<FilterType>(
    page?.filter ?? 'original',
  );
  const [busy, setBusy] = useState<'add' | 'done' | 'rotate' | null>(null);

  if (!page) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Page not found.</Text>
      </View>
    );
  }

  /**
   * Bakes the selected filter via the native Bitmap/Canvas module (always
   * software, never a GPU View layer - see services/nativeImageFilter) so
   * the saved page can't come out solid black the way the old
   * screenshot-of-a-GPU-view approach could on some devices.
   */
  async function bakeCurrentFilter(): Promise<string> {
    if (selectedFilter === 'original') {
      return page!.rawUri;
    }
    const outputPath = `${RNFS.CachesDirectoryPath}/baked_${generateId()}.jpg`;
    return bakeFilterToFile(page!.rawUri, selectedFilter, outputPath);
  }

  async function handleRetake() {
    session.removePage(page!.id);
    navigation.replace('Scan', {folderId: session.folderId});
  }

  function handleClose() {
    Alert.alert(
      'Discard scan?',
      "The pages you've captured so far won't be saved.",
      [
        {text: 'Keep Scanning', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            session.reset();
            navigation.navigate('MainTabs', {screen: 'Home'});
          },
        },
      ],
    );
  }

  async function handleAddAnotherPage() {
    try {
      setBusy('add');
      const bakedUri = await bakeCurrentFilter();
      session.updatePage(page!.id, {rawUri: bakedUri, filter: selectedFilter});
      navigation.replace('Scan', {folderId: session.folderId});
    } catch (error) {
      Alert.alert(
        'Something went wrong',
        'Could not apply the filter. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRotateLeft() {
    try {
      setBusy('rotate');
      const rotatedUri = await rotateImageFile90(
        page!.rawUri,
        `rotate_${page!.id}_${generateId()}`,
        270,
      );
      session.updatePage(page!.id, {rawUri: rotatedUri});
    } catch (error) {
      Alert.alert('Rotate failed', 'Could not rotate this page.');
    } finally {
      setBusy(null);
    }
  }

  function handleCrop() {
    if (busy !== null) {
      return;
    }
    navigation.navigate('Trim', {rawUri: page!.rawUri, pageId: page!.id});
  }

  async function handleJumpToPage(targetPageId: string) {
    if (targetPageId === page!.id || busy !== null) {
      return;
    }
    // The page being left behind keeps whatever filter is currently selected
    // for it, same as leaving via "Add Page" - switching pages shouldn't
    // silently discard a filter choice.
    try {
      setBusy('add');
      const bakedUri = await bakeCurrentFilter();
      session.updatePage(page!.id, {rawUri: bakedUri, filter: selectedFilter});
      navigation.replace('Filter', {pageId: targetPageId});
    } catch (error) {
      Alert.alert(
        'Something went wrong',
        'Could not apply the filter. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  }

  function handleRemoveFromStrip(targetPageId: string) {
    if (targetPageId === page!.id) {
      return;
    }
    session.removePage(targetPageId);
  }

  async function handleDone() {
    try {
      setBusy('done');
      const bakedUri = await bakeCurrentFilter();
      const finalPages = session.pages.map(p =>
        p.id === page!.id
          ? {...p, rawUri: bakedUri, filter: selectedFilter}
          : p,
      );

      let docId: string;
      if (session.targetDocId) {
        docId = session.targetDocId;
        await appendSessionToDocument(docId, finalPages);
      } else {
        docId = await saveSessionAsDocument({
          docName: session.docName,
          folderId: session.folderId,
          pages: finalPages,
        });
      }
      session.reset();
      navigation.replace('DocumentDetail', {docId});
    } catch (error) {
      Alert.alert(
        'Save failed',
        'Could not save the document. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
          <Icon name="close" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Page {pageNumber} of {session.pages.length}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {session.pages.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pagesStrip}
          contentContainerStyle={styles.pagesStripContent}>
          {session.pages.map((sessionPage, index) => {
            const active = sessionPage.id === page!.id;
            return (
              <TouchableOpacity
                key={sessionPage.id}
                style={[styles.pageChip, active && styles.pageChipActive]}
                onPress={() => handleJumpToPage(sessionPage.id)}
                disabled={busy !== null}
                activeOpacity={0.8}>
                <FilteredImage
                  uri={sessionPage.rawUri}
                  filter={sessionPage.filter}
                  style={styles.pageChipThumb}
                />
                <View style={styles.pageChipBadge}>
                  <Text style={styles.pageChipBadgeText}>{index + 1}</Text>
                </View>
                {!active && (
                  <TouchableOpacity
                    style={styles.pageChipRemove}
                    onPress={() => handleRemoveFromStrip(sessionPage.id)}
                    hitSlop={6}>
                    <Icon name="close" size={12} color={colors.white} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.previewWrap}>
        <ZoomableImage style={styles.previewImage}>
          <FilteredImage
            uri={page.rawUri}
            filter={selectedFilter}
            style={StyleSheet.absoluteFill}
          />
        </ZoomableImage>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filmstrip}
        contentContainerStyle={styles.filmstripContent}>
        {FILTER_OPTIONS.map(option => {
          const active = selectedFilter === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSelectedFilter(option.id)}>
              <FilteredImage
                uri={page.rawUri}
                filter={option.id}
                style={styles.filterThumb}
              />
              <View
                style={[
                  styles.filterLabelBar,
                  active && styles.filterLabelBarActive,
                ]}>
                <Text
                  style={[
                    styles.filterLabel,
                    active && styles.filterLabelActive,
                  ]}>
                  {option.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.actionBar, {paddingBottom: 12 + insets.bottom}]}>
        <View style={styles.actionBarRow}>
          <TouchableOpacity
            style={styles.iconButton}
            disabled={busy !== null}
            onPress={handleRetake}>
            <Icon name="replay" size={22} color={colors.white} />
            <Text style={styles.iconButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            disabled={busy !== null}
            onPress={handleAddAnotherPage}>
            {busy === 'add' ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Icon name="add-a-photo" size={22} color={colors.white} />
                <Text style={styles.iconButtonText}>Add Page</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            disabled={busy !== null}
            onPress={handleRotateLeft}>
            {busy === 'rotate' ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Icon name="rotate-left" size={22} color={colors.white} />
                <Text style={styles.iconButtonText}>Left</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            disabled={busy !== null}
            onPress={handleCrop}>
            <Icon name="crop" size={22} color={colors.white} />
            <Text style={styles.iconButtonText}>Crop</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.doneButton}
          disabled={busy !== null}
          onPress={handleDone}>
          {busy === 'done' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon name="check-circle" size={20} color={colors.white} />
              <Text style={styles.doneButtonText}>
                Save Document · {session.pages.length} page
                {session.pages.length === 1 ? '' : 's'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  text: {
    color: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: colors.black,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  pagesStrip: {
    maxHeight: 74,
    backgroundColor: colors.black,
  },
  pagesStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  pageChip: {
    width: 44,
    height: 58,
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pageChipActive: {
    borderColor: colors.accent,
  },
  pageChipThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  pageChipBadge: {
    position: 'absolute',
    left: 3,
    top: 3,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageChipBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },
  pageChipRemove: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  filmstrip: {
    maxHeight: 118,
    backgroundColor: '#111111',
  },
  filmstripContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  filterChip: {
    width: 76,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    borderColor: colors.accent,
  },
  filterThumb: {
    width: '100%',
    height: '100%',
  },
  filterLabelBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  filterLabelBarActive: {
    backgroundColor: colors.accent,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  filterLabelActive: {
    color: colors.white,
  },
  actionBar: {
    padding: 16,
    gap: 12,
    backgroundColor: '#111111',
  },
  actionBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  iconButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  doneButton: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    elevation: 3,
  },
  doneButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
