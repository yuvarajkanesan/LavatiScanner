import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
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
  EditablePage,
  isPdfRenderable,
  loadPdfForEditing,
} from '../services/pdfEdit';
import {renderAllPdfPages} from '../services/pdfThumbnail';
import {saveSessionAsDocument} from '../services/scanPipeline';
import {readFileBytes} from '../services/pdfBytes';
import {promptForText} from '../utils/promptForText';
import Icon, {IconFamily} from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import Button from '../components/Button';
import ScreenBackground from '../components/ScreenBackground';
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
    if (!sourceDocRef.current) {
      throw new Error('No PDF loaded');
    }
    const outputName =
      (fileName ?? 'document').replace(/\.pdf$/i, '') + '_edited';
    return buildEditedPdf(sourceDocRef.current, pages, outputName);
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
    const docName = await promptForText('Save as', defaultName);
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
      <LinearGradient
        colors={colors.gradientHero}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.hero}>
        <FeatureBadge
          icon="file-document-edit-outline"
          color={colors.accent}
          size={44}
          variant="glow"
        />
        <View style={styles.heroText}>
          <Text style={styles.fileNameHeader} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={styles.subtitle}>
            {pages.length} page{pages.length === 1 ? '' : 's'} · long-press a
            page to drag & reorder
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
          <Icon name="restore" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </LinearGradient>

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
                  onPress={() => item.thumbUri && setPreviewPage(item)}
                  onLongPress={drag}
                  disabled={isActive}
                  activeOpacity={0.8}>
                  {item.thumbUri ? (
                    <Image
                      source={{uri: item.thumbUri}}
                      style={[
                        styles.pageThumb,
                        {transform: [{rotate: `${item.rotation}deg`}]},
                      ]}
                      resizeMode="contain"
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
        <EditorActionButton
          icon="content-save-move-outline"
          family="community"
          color={colors.accent}
          label="Save to Documents"
          loading={busy === 'save'}
          disabled={busy !== null || pages.length === 0}
          onPress={handleSaveToDocuments}
        />
        <EditorActionButton
          icon={f.sharePdf.icon}
          family={f.sharePdf.family}
          color={f.sharePdf.color}
          label="Share PDF"
          loading={busy === 'share'}
          disabled={busy !== null || pages.length === 0}
          onPress={handleShare}
        />
        <EditorActionButton
          icon={f.shareImage.icon}
          family={f.shareImage.family}
          color={f.shareImage.color}
          label="Share Image"
          loading={busy === 'shareImage'}
          disabled={busy !== null || pages.length === 0}
          onPress={handleShareImages}
        />
      </View>

      <Modal
        visible={previewPage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPage(null)}>
        <View style={styles.previewBackdrop}>
          <TouchableOpacity
            style={[styles.previewClose, {top: 20 + insets.top}]}
            onPress={() => setPreviewPage(null)}
            hitSlop={10}>
            <Icon name="close" size={26} color={colors.white} />
          </TouchableOpacity>
          {previewPage?.thumbUri && (
            <Image
              source={{uri: previewPage.thumbUri}}
              style={[
                styles.previewImage,
                {transform: [{rotate: `${previewPage.rotation}deg`}]},
              ]}
              resizeMode="contain"
            />
          )}
          {previewPage && (
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => handleRotate(previewPage.key)}>
                <Icon name="rotate-right" size={22} color={colors.white} />
                <Text style={styles.previewActionText}>Rotate</Text>
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

interface EditorActionButtonProps {
  icon: string;
  family?: IconFamily;
  color: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function EditorActionButton({
  icon,
  family,
  color,
  label,
  onPress,
  disabled,
  loading,
}: EditorActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        editorActionStyles.btn,
        {backgroundColor: `${color}14`},
        disabled && editorActionStyles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          <FeatureBadge
            icon={icon}
            family={family}
            color={color}
            size={34}
            variant="solid"
          />
          <Text style={[editorActionStyles.label, {color}]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const editorActionStyles = StyleSheet.create({
  btn: {
    flex: 1,
    height: 82,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
  },
});

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
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    heroText: {
      flex: 1,
    },
    fileNameHeader: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
    },
    resetBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    addPagesBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
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
      flexDirection: 'row',
      gap: 10,
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    previewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewClose: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 1,
    },
    previewImage: {
      width: '85%',
      height: '70%',
    },
    previewActions: {
      flexDirection: 'row',
      gap: 32,
      marginTop: 28,
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
