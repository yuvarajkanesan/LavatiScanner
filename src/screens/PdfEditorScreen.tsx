import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Alert from '../utils/customAlert';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import Share from 'react-native-share';
import {PDFDocument} from 'pdf-lib';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {pickPdfFile} from '../services/documentPicker';
import {pickImportFiles} from '../services/filePicker';
import {
  buildEditedPdf,
  CropRect,
  EditablePage,
  isPdfRenderable,
  loadPdfForEditing,
} from '../services/pdfEdit';
import {renderAllPdfPages} from '../services/pdfThumbnail';
import {saveSessionAsDocument} from '../services/scanPipeline';
import {documentNameExists} from '../db/database';
import {readFileBytes} from '../services/pdfBytes';
import {promptForText} from '../utils/promptForText';
import Icon from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import Button from '../components/Button';
import ScreenBackground from '../components/ScreenBackground';
import FilteredImage from '../components/FilteredImage';
import ZoomableImage from '../components/ZoomableImage';
import {FILTER_OPTIONS} from '../services/filters';
import {FilterType} from '../types/models';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {documentFeatureIcons as f} from '../theme/featureIcons';

interface EditorPage extends EditablePage {
  key: string;
  thumbUri?: string;
  thumbUnavailable?: boolean;
}

type Props = NativeStackScreenProps<RootStackParamList, 'PdfEditor'>;

export default function PdfEditorScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingPages, setAddingPages] = useState(false);
  const [busy, setBusy] = useState<'save' | 'share' | 'shareImage' | null>(
    null,
  );
  const [previewPage, setPreviewPage] = useState<EditorPage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>({
    x: 0.05,
    y: 0.05,
    width: 0.9,
    height: 0.9,
  });
  const [cropImageLayout, setCropImageLayout] = useState({width: 0, height: 0});
  const [cropAspectRatio, setCropAspectRatio] = useState(1);
  const cropRectRef = useRef(cropRect);
  const cropImageLayoutRef = useRef(cropImageLayout);
  const cropDragStartRef = useRef<CropRect | null>(null);
  const sourceDocRef = useRef<PDFDocument | null>(null);
  const sourceUriRef = useRef<string | null>(null);

  // Warn before losing edits that were never saved to the library or shared
  // out — mirrors React Navigation's documented "prevent leaving with
  // unsaved changes" pattern (intercept beforeRemove, replay the original
  // action via navigation.dispatch if the user confirms discarding).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      if (!dirty) {
        return;
      }
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved edits to this PDF. Leaving now will lose them unless you save or share first.',
        [
          {text: 'Keep Editing', style: 'cancel'},
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, dirty]);

  async function loadPdf(uri: string, name: string) {
    try {
      setLoading(true);
      const doc = await loadPdfForEditing(uri);
      sourceDocRef.current = doc;
      sourceUriRef.current = uri;
      setFileName(name);
      setDirty(false);
      setPages(
        Array.from({length: doc.getPageCount()}, (_, i) => ({
          key: `p${i}`,
          originalIndex: i,
          rotation: 0,
        })),
      );

      // Android's native page renderer throws an uncaught exception (not a
      // rejected promise) for any encrypted PDF, which would crash past a
      // try/catch — so this is skipped entirely for files it can't open.
      isPdfRenderable(uri).then(renderable => {
        if (!renderable) {
          setPages(prev => prev.map(p => ({...p, thumbUnavailable: true})));
          return;
        }
        renderAllPdfPages(uri)
          .then(thumbs => {
            setPages(prev =>
              prev.map((p, i) => ({...p, thumbUri: thumbs[i]?.uri})),
            );
          })
          .catch(() => {
            setPages(prev => prev.map(p => ({...p, thumbUnavailable: true})));
          });
      });
    } catch (error) {
      Alert.alert(
        'Could not open PDF',
        'This file may be password-protected or corrupted.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (route.params?.uri) {
      loadPdf(route.params.uri, route.params.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.uri]);

  async function handlePick() {
    const picked = await pickPdfFile();
    if (!picked) {
      return;
    }
    await loadPdf(picked.uri, picked.name);
  }

  function handleReset() {
    if (!sourceUriRef.current || !fileName) {
      return;
    }
    Alert.alert(
      'Discard changes?',
      'This undoes every rotation, deletion, and reorder you made.',
      [
        {text: 'Keep Editing', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => loadPdf(sourceUriRef.current!, fileName),
        },
      ],
    );
  }

  async function handleAddPages() {
    if (addingPages) {
      return;
    }
    const doc = sourceDocRef.current;
    if (!doc) {
      return;
    }
    try {
      setAddingPages(true);
      const {images, pdfs} = await pickImportFiles();
      if (images.length === 0 && pdfs.length === 0) {
        return;
      }

      const newPages: EditorPage[] = [];
      const skipped: string[] = [];

      for (const image of images) {
        const jpgBytes = await readFileBytes(image.uri);
        const jpgImage = await doc.embedJpg(jpgBytes);
        const {width, height} = jpgImage.size();
        const page = doc.addPage([width, height]);
        page.drawImage(jpgImage, {x: 0, y: 0, width, height});
        const originalIndex = doc.getPageCount() - 1;
        newPages.push({
          key: `p${originalIndex}`,
          originalIndex,
          rotation: 0,
          thumbUri: image.uri,
        });
      }

      for (const pdf of pdfs) {
        // Same encrypted-PDF guard as loadPdf/ToolsScreen's import — the
        // native renderer used for thumbnails throws on any encrypted file.
        if (!(await isPdfRenderable(pdf.uri))) {
          skipped.push(pdf.name);
          continue;
        }
        const srcDoc = await loadPdfForEditing(pdf.uri);
        const copied = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
        let thumbs: {uri: string}[] = [];
        try {
          thumbs = await renderAllPdfPages(pdf.uri);
        } catch {
          thumbs = [];
        }
        copied.forEach((copiedPage, i) => {
          doc.addPage(copiedPage);
          const originalIndex = doc.getPageCount() - 1;
          newPages.push({
            key: `p${originalIndex}`,
            originalIndex,
            rotation: 0,
            thumbUri: thumbs[i]?.uri,
            thumbUnavailable: !thumbs[i],
          });
        });
      }

      if (newPages.length > 0) {
        setPages(prev => [...prev, ...newPages]);
        setDirty(true);
      }
      if (skipped.length > 0) {
        Alert.alert(
          'Some files skipped',
          `Could not open: ${skipped.join(', ')}. The file may be password-protected.`,
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not add pages',
        'One of the selected files may be corrupted.',
      );
    } finally {
      setAddingPages(false);
    }
  }

  function handleRotate(key: string) {
    setPages(prev =>
      prev.map(p =>
        p.key === key
          ? {
              ...p,
              rotation: ((p.rotation + 90) % 360) as EditorPage['rotation'],
            }
          : p,
      ),
    );
    setDirty(true);
  }

  function handleSetFilter(key: string, filterId: FilterType) {
    setPages(prev =>
      prev.map(p => (p.key === key ? {...p, filter: filterId} : p)),
    );
    setPreviewPage(prev =>
      prev && prev.key === key ? {...prev, filter: filterId} : prev,
    );
    setDirty(true);
  }

  function handlePreviewSwipe(direction: 1 | -1) {
    if (!previewPage) {
      return;
    }
    const index = pages.findIndex(p => p.key === previewPage.key);
    const next = pages[index + direction];
    if (next?.thumbUri) {
      setPreviewPage(next);
    }
  }

  const CROP_MIN_SIZE = 0.08;

  function handleEnterCropMode() {
    if (!previewPage?.thumbUri) {
      return;
    }
    const initial = previewPage.cropRect ?? {
      x: 0.05,
      y: 0.05,
      width: 0.9,
      height: 0.9,
    };
    cropRectRef.current = initial;
    setCropRect(initial);
    // The crop box's aspect ratio must match the image's own pixel
    // dimensions exactly, so FilteredImage's `resizeMode="contain"` fills
    // it edge to edge with no letterboxing - otherwise the drag-handle
    // math (based on the container's own pixel layout) would be measuring
    // against empty space rather than the actual image content.
    Image.getSize(
      previewPage.thumbUri,
      (w, h) => setCropAspectRatio(w / h || 1),
      () => setCropAspectRatio(1),
    );
    setCropMode(true);
  }

  function handleCancelCrop() {
    setCropMode(false);
  }

  function handleApplyCrop() {
    if (!previewPage) {
      return;
    }
    const rect = cropRectRef.current;
    setPages(prev =>
      prev.map(p => (p.key === previewPage.key ? {...p, cropRect: rect} : p)),
    );
    setPreviewPage(prev =>
      prev && prev.key === previewPage.key ? {...prev, cropRect: rect} : prev,
    );
    setDirty(true);
    setCropMode(false);
  }

  function handleCropImageLayout(e: LayoutChangeEvent) {
    const {width, height} = e.nativeEvent.layout;
    cropImageLayoutRef.current = {width, height};
    setCropImageLayout({width, height});
  }

  function makeCropHandleResponder(corner: 'tl' | 'br') {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        cropDragStartRef.current = cropRectRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const layout = cropImageLayoutRef.current;
        const start = cropDragStartRef.current;
        if (!layout.width || !layout.height || !start) {
          return;
        }
        const dxRatio = gesture.dx / layout.width;
        const dyRatio = gesture.dy / layout.height;
        let next: CropRect;
        if (corner === 'tl') {
          const maxX = start.x + start.width - CROP_MIN_SIZE;
          const maxY = start.y + start.height - CROP_MIN_SIZE;
          const newX = Math.min(Math.max(start.x + dxRatio, 0), maxX);
          const newY = Math.min(Math.max(start.y + dyRatio, 0), maxY);
          next = {
            x: newX,
            y: newY,
            width: start.x + start.width - newX,
            height: start.y + start.height - newY,
          };
        } else {
          const minRight = start.x + CROP_MIN_SIZE;
          const minBottom = start.y + CROP_MIN_SIZE;
          const right = Math.max(
            Math.min(start.x + start.width + dxRatio, 1),
            minRight,
          );
          const bottom = Math.max(
            Math.min(start.y + start.height + dyRatio, 1),
            minBottom,
          );
          next = {
            x: start.x,
            y: start.y,
            width: right - start.x,
            height: bottom - start.y,
          };
        }
        cropRectRef.current = next;
        setCropRect(next);
      },
    });
  }

  const cropTopLeftResponder = useRef(makeCropHandleResponder('tl')).current;
  const cropBottomRightResponder = useRef(
    makeCropHandleResponder('br'),
  ).current;

  function handleDelete(key: string, pageNumber: number) {
    if (pages.length === 1) {
      Alert.alert("Can't delete", 'A PDF needs at least one page.');
      return;
    }
    Alert.alert(
      'Delete page',
      `Delete page ${pageNumber}? This can't be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPages(prev => prev.filter(p => p.key !== key));
            setPreviewPage(prev => (prev?.key === key ? null : prev));
            setDirty(true);
          },
        },
      ],
    );
  }

  async function buildOutput(): Promise<string> {
    if (!sourceDocRef.current || !sourceUriRef.current) {
      throw new Error('No PDF loaded');
    }
    const outputName =
      (fileName ?? 'document').replace(/\.pdf$/i, '') + '_edited';
    return buildEditedPdf(
      sourceUriRef.current,
      sourceDocRef.current,
      pages,
      outputName,
    );
  }

  async function handleSaveToDocuments() {
    if (pages.length === 0) {
      Alert.alert("Can't save", 'Add at least one page before saving.');
      return;
    }
    if (busy !== null) {
      return;
    }
    const defaultName = (fileName ?? 'document').replace(/\.pdf$/i, '');
    const docName = await promptForText('Save as', defaultName, async value =>
      (await documentNameExists(value))
        ? 'A document with this name already exists.'
        : null,
    );
    if (docName === null) {
      return;
    }
    try {
      setBusy('save');
      const outputPath = await buildOutput();
      const rendered = await renderAllPdfPages(outputPath);
      const docId = await saveSessionAsDocument({
        docName: docName.trim() || defaultName,
        folderId: null,
        pages: rendered.map((r, i) => ({
          id: `p${i}`,
          rawUri: r.uri,
          filter: 'original',
        })),
      });
      setDirty(false);
      Alert.alert('Saved', 'Document saved successfully.');
      navigation.replace('DocumentDetail', {docId});
    } catch (error) {
      console.error('PdfEditor: save to documents failed', error);
      Alert.alert('Save failed', 'Could not save the edited PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (pages.length === 0) {
      Alert.alert("Can't share", 'Add at least one page before sharing.');
      return;
    }
    if (busy !== null) {
      return;
    }
    try {
      setBusy('share');
      const outputPath = await buildOutput();
      await Share.open({
        url: `file://${outputPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
      setDirty(false);
    } catch (error) {
      console.error('PdfEditor: share pdf failed', error);
      Alert.alert('Share failed', 'Could not share the edited PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShareImages() {
    if (pages.length === 0) {
      Alert.alert("Can't share", 'Add at least one page before sharing.');
      return;
    }
    if (busy !== null) {
      return;
    }
    try {
      setBusy('shareImage');
      const outputPath = await buildOutput();
      const rendered = await renderAllPdfPages(outputPath, 90);
      await Share.open({
        urls: rendered.map(r => r.uri),
        failOnCancel: false,
      });
      setDirty(false);
    } catch (error) {
      console.error('PdfEditor: share images failed', error);
      Alert.alert('Share failed', 'Could not share the pages as images.');
    } finally {
      setBusy(null);
    }
  }

  if (!fileName) {
    return (
      <ScreenBackground style={styles.center}>
        <View style={styles.iconWrap}>
          <FeatureBadge
            icon="edit-document"
            family="material"
            color={colors.accent}
            size={64}
            variant="glow"
          />
        </View>
        <Text style={styles.title}>PDF Editor</Text>
        <Text style={styles.description}>
          Delete, rotate, and reorder pages of any PDF, then save or share the
          result.
        </Text>
        <View style={styles.ctaWrap}>
          <Button
            label="Choose PDF"
            icon="file-open"
            iconFamily="material"
            onPress={handlePick}
            loading={loading}
            variant="gradient"
            size="lg"
          />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.fileNameHeader} numberOfLines={1}>
            Edit PDF
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addPagesBtn}
          onPress={handleAddPages}
          disabled={addingPages}
          hitSlop={8}>
          {addingPages ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Icon name="file-plus-outline" family="community" size={18} color={colors.white} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={handleReset}
          hitSlop={8}>
          <Icon name="restore" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
      <View style={styles.reorderHint}>
        <Icon
          name="gesture-tap-hold"
          family="community"
          size={16}
          color={colors.accent}
        />
        <Text style={styles.reorderHintText}>
          Press and hold a page to reorder
        </Text>
      </View>

      <DraggableFlatList
        data={pages}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.list}
        onDragEnd={({data}) => {
          setPages(data);
          setDirty(true);
        }}
        renderItem={({
          item,
          drag,
          isActive,
          getIndex,
        }: RenderItemParams<EditorPage>) => {
          const pageNumber = (getIndex() ?? 0) + 1;
          return (
            <ScaleDecorator>
              <View style={[styles.pageRow, isActive && styles.pageRowActive]}>
                <TouchableOpacity
                  style={styles.pageThumbWrap}
                  onPress={() => {
                    if (item.thumbUri) {
                      setCropMode(false);
                      setPreviewPage(item);
                    }
                  }}
                  onLongPress={drag}
                  disabled={isActive}
                  activeOpacity={0.8}>
                  {item.thumbUri ? (
                    <FilteredImage
                      uri={item.thumbUri}
                      filter={item.filter ?? 'original'}
                      style={[
                        styles.pageThumb,
                        {transform: [{rotate: `${item.rotation}deg`}]},
                      ]}
                    />
                  ) : item.thumbUnavailable ? (
                    <Icon
                      name="picture-as-pdf"
                      size={22}
                      color={colors.textMuted}
                    />
                  ) : (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{pageNumber}</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.pageInfo}>
                  <Text style={styles.pageLabel}>
                    Page {item.originalIndex + 1}
                    {item.rotation !== 0 ? ` · rotated ${item.rotation}°` : ''}
                  </Text>
                  <Text style={styles.pageHint}>Tap thumbnail to preview</Text>
                </View>

                <View style={styles.pageActions}>
                  <TouchableOpacity
                    style={[
                      styles.pageActionBtn,
                      {backgroundColor: `${colors.accent}1F`},
                    ]}
                    onPress={() => handleRotate(item.key)}
                    hitSlop={6}>
                    <Icon name="rotate-right" size={20} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pageActionBtn,
                      {backgroundColor: `${colors.danger}1F`},
                    ]}
                    onPress={() => handleDelete(item.key, pageNumber)}
                    hitSlop={6}>
                    <Icon
                      name="delete-outline"
                      size={20}
                      color={colors.danger}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onLongPress={drag}
                  disabled={isActive}
                  hitSlop={8}
                  style={styles.dragHandle}>
                  <Icon name="drag-handle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </ScaleDecorator>
          );
        }}
      />

      {pages.length === 0 && (
        <Text style={styles.emptyHint}>
          Add at least one page to save or share.
        </Text>
      )}

      <View style={[styles.actionBar, {paddingBottom: 14 + insets.bottom}]}>
        <TouchableOpacity
          style={styles.docEditBtn}
          onPress={handleSaveToDocuments}
          disabled={busy !== null || pages.length === 0}
          activeOpacity={0.85}>
          {busy === 'save' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon
                name="content-save-outline"
                family="community"
                size={18}
                color={colors.white}
              />
              <Text style={styles.docEditBtnText}>Save to documents</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.docActionRow}>
          <TouchableOpacity
            style={[styles.docPill, {backgroundColor: `${colors.danger}1A`}]}
            onPress={handleShare}
            disabled={busy !== null || pages.length === 0}
            activeOpacity={0.75}>
            {busy === 'share' ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <>
                <Icon
                  name={f.sharePdf.icon}
                  family={f.sharePdf.family}
                  size={18}
                  color={colors.danger}
                />
                <Text style={[styles.docPillText, {color: colors.danger}]}>
                  Share PDF
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.docPill, {backgroundColor: `${colors.success}1A`}]}
            onPress={handleShareImages}
            disabled={busy !== null || pages.length === 0}
            activeOpacity={0.75}>
            {busy === 'shareImage' ? (
              <ActivityIndicator color={colors.success} size="small" />
            ) : (
              <>
                <Icon
                  name={f.shareImage.icon}
                  family={f.shareImage.family}
                  size={18}
                  color={colors.success}
                />
                <Text style={[styles.docPillText, {color: colors.success}]}>
                  Share images
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={previewPage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCropMode(false);
          setPreviewPage(null);
        }}>
        <View style={styles.previewBackdrop}>
          <TouchableOpacity
            style={[styles.previewClose, {top: 20 + insets.top}]}
            onPress={() => {
              setCropMode(false);
              setPreviewPage(null);
            }}
            hitSlop={10}>
            <Icon name="close" size={26} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.previewImageArea}>
            {previewPage?.thumbUri && cropMode ? (
              <View
                style={[styles.cropImageWrap, {aspectRatio: cropAspectRatio}]}
                onLayout={handleCropImageLayout}>
                <Image
                  source={{uri: previewPage.thumbUri}}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
                {cropImageLayout.width > 0 && (
                  <>
                    {/* Dimmed margins outside the crop rect */}
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropDim,
                        {
                          left: 0,
                          top: 0,
                          right: 0,
                          height: cropRect.y * cropImageLayout.height,
                        },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropDim,
                        {
                          left: 0,
                          bottom: 0,
                          right: 0,
                          top:
                            (cropRect.y + cropRect.height) *
                            cropImageLayout.height,
                        },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropDim,
                        {
                          left: 0,
                          top: cropRect.y * cropImageLayout.height,
                          width: cropRect.x * cropImageLayout.width,
                          height: cropRect.height * cropImageLayout.height,
                        },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropDim,
                        {
                          right: 0,
                          top: cropRect.y * cropImageLayout.height,
                          width:
                            (1 - cropRect.x - cropRect.width) *
                            cropImageLayout.width,
                          height: cropRect.height * cropImageLayout.height,
                        },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropRectBorder,
                        {
                          left: cropRect.x * cropImageLayout.width,
                          top: cropRect.y * cropImageLayout.height,
                          width: cropRect.width * cropImageLayout.width,
                          height: cropRect.height * cropImageLayout.height,
                        },
                      ]}
                    />
                    <View
                      {...cropTopLeftResponder.panHandlers}
                      style={[
                        styles.cropHandle,
                        {
                          left:
                            cropRect.x * cropImageLayout.width -
                            CROP_HANDLE_SIZE / 2,
                          top:
                            cropRect.y * cropImageLayout.height -
                            CROP_HANDLE_SIZE / 2,
                        },
                      ]}
                    />
                    <View
                      {...cropBottomRightResponder.panHandlers}
                      style={[
                        styles.cropHandle,
                        {
                          left:
                            (cropRect.x + cropRect.width) *
                              cropImageLayout.width -
                            CROP_HANDLE_SIZE / 2,
                          top:
                            (cropRect.y + cropRect.height) *
                              cropImageLayout.height -
                            CROP_HANDLE_SIZE / 2,
                        },
                      ]}
                    />
                  </>
                )}
              </View>
            ) : (
              previewPage?.thumbUri && (
                <ZoomableImage
                  key={previewPage.key}
                  style={styles.previewImage}
                  onSwipeLeft={() => handlePreviewSwipe(1)}
                  onSwipeRight={() => handlePreviewSwipe(-1)}>
                  <FilteredImage
                    uri={previewPage.thumbUri}
                    filter={previewPage.filter ?? 'original'}
                    style={[
                      StyleSheet.absoluteFill,
                      {transform: [{rotate: `${previewPage.rotation}deg`}]},
                    ]}
                  />
                </ZoomableImage>
              )
            )}
          </View>

          {previewPage?.thumbUri && !cropMode && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.previewFilmstrip}
              contentContainerStyle={styles.previewFilmstripContent}>
              {FILTER_OPTIONS.map(option => {
                const active = (previewPage.filter ?? 'original') === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.previewFilterChip}
                    onPress={() => handleSetFilter(previewPage.key, option.id)}>
                    <FilteredImage
                      uri={previewPage.thumbUri!}
                      filter={option.id}
                      style={[
                        styles.previewFilterThumb,
                        active && styles.previewFilterThumbActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.previewFilterLabel,
                        active && styles.previewFilterLabelActive,
                      ]}
                      numberOfLines={1}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {previewPage && cropMode && (
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handleCancelCrop}>
                <Icon name="close" size={22} color={colors.white} />
                <Text style={styles.previewActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handleApplyCrop}>
                <Icon name="check" size={22} color={colors.accentDark} />
                <Text
                  style={[
                    styles.previewActionText,
                    {color: colors.accentDark},
                  ]}>
                  Apply Crop
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {previewPage && !cropMode && (
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => handleRotate(previewPage.key)}>
                <Icon name="rotate-right" size={22} color={colors.white} />
                <Text style={styles.previewActionText}>Rotate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handleEnterCropMode}>
                <Icon name="crop" size={22} color={colors.white} />
                <Text style={styles.previewActionText}>Crop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => {
                  const pageNumber =
                    pages.findIndex(p => p.key === previewPage.key) + 1;
                  handleDelete(previewPage.key, pageNumber);
                }}>
                <Icon name="delete-outline" size={22} color={colors.danger} />
                <Text
                  style={[styles.previewActionText, {color: colors.danger}]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const CROP_HANDLE_SIZE = 28;

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    iconWrap: {
      marginBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    description: {
      marginTop: 8,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    ctaWrap: {
      marginTop: 28,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.accent,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroText: {
      flex: 1,
    },
    fileNameHeader: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.white,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 13,
      color: 'rgba(255,255,255,0.8)',
    },
    reorderHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginHorizontal: 16,
      marginTop: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.accentMuted,
    },
    reorderHintText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    resetBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    addPagesBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
      marginRight: 8,
    },
    list: {
      padding: 16,
      paddingBottom: 24,
    },
    pageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      padding: 10,
      gap: 10,
    },
    pageRowActive: {
      borderColor: colors.accent,
    },
    pageThumbWrap: {
      width: 60,
      height: 80,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    pageThumb: {
      width: '100%',
      height: '100%',
    },
    pageBadge: {
      position: 'absolute',
      left: 4,
      top: 4,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    pageInfo: {
      flex: 1,
    },
    pageLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    pageHint: {
      marginTop: 4,
      fontSize: 11,
      color: colors.textMuted,
    },
    pageActions: {
      flexDirection: 'row',
      gap: 8,
    },
    pageActionBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dragHandle: {
      paddingLeft: 2,
    },
    emptyHint: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.danger,
      paddingBottom: 8,
    },
    actionBar: {
      gap: 10,
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    docActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    docPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 23,
    },
    docPillText: {
      fontSize: 14,
      fontWeight: '700',
    },
    docEditBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.accent,
    },
    docEditBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    previewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
    },
    previewClose: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 1,
    },
    // Takes all the leftover vertical space between the close button and
    // the fixed-height filmstrip/actions below it, so those stay reachable
    // (not pushed off-screen) regardless of screen height - a percentage-
    // height image inside a centered column was the previous approach, and
    // could crowd out the filmstrip on a short/tablet-landscape viewport.
    previewImageArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: '7.5%',
      paddingTop: 70,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    cropImageWrap: {
      width: '100%',
      alignSelf: 'center',
    },
    cropDim: {
      position: 'absolute',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    cropRectBorder: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: colors.white,
    },
    cropHandle: {
      position: 'absolute',
      width: CROP_HANDLE_SIZE,
      height: CROP_HANDLE_SIZE,
      borderRadius: CROP_HANDLE_SIZE / 2,
      backgroundColor: colors.white,
      borderWidth: 3,
      borderColor: colors.accent,
    },
    previewFilmstrip: {
      maxHeight: 96,
      flexGrow: 0,
      flexShrink: 0,
    },
    previewFilmstripContent: {
      paddingHorizontal: 20,
      gap: 10,
    },
    previewFilterChip: {
      width: 56,
      alignItems: 'center',
    },
    previewFilterThumb: {
      width: 56,
      height: 72,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    previewFilterThumbActive: {
      borderColor: colors.accent,
    },
    previewFilterLabel: {
      marginTop: 4,
      fontSize: 10,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.75)',
      textAlign: 'center',
    },
    previewFilterLabelActive: {
      color: colors.accentDark,
    },
    previewActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 32,
      paddingVertical: 20,
      flexGrow: 0,
      flexShrink: 0,
    },
    previewActionBtn: {
      alignItems: 'center',
      gap: 6,
    },
    previewActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.white,
    },
  });
