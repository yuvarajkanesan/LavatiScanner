import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import Share from 'react-native-share';
import {PDFDocument} from 'pdf-lib';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {pickPdfFile} from '../services/documentPicker';
import {
  buildEditedPdf,
  EditablePage,
  isPdfRenderable,
  loadPdfForEditing,
} from '../services/pdfEdit';
import {renderAllPdfPages} from '../services/pdfThumbnail';
import Icon from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

interface EditorPage extends EditablePage {
  key: string;
  thumbUri?: string;
  thumbUnavailable?: boolean;
}

type Props = NativeStackScreenProps<RootStackParamList, 'PdfEditor'>;

export default function PdfEditorScreen({route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [previewPage, setPreviewPage] = useState<EditorPage | null>(null);
  const sourceDocRef = useRef<PDFDocument | null>(null);
  const sourceUriRef = useRef<string | null>(null);

  async function loadPdf(uri: string, name: string) {
    try {
      setLoading(true);
      const doc = await loadPdfForEditing(uri);
      sourceDocRef.current = doc;
      sourceUriRef.current = uri;
      setFileName(name);
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

  async function handleSave() {
    if (pages.length === 0) {
      return;
    }
    try {
      setBusy('save');
      await buildOutput();
      Alert.alert(
        'PDF saved',
        'The edited PDF was saved. Use Share to send it.',
      );
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the edited PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (pages.length === 0) {
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
    } catch (error) {
      Alert.alert('Share failed', 'Could not share the edited PDF.');
    } finally {
      setBusy(null);
    }
  }

  if (!fileName) {
    return (
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Icon name="edit-document" size={40} color={colors.accent} />
        </View>
        <Text style={styles.title}>PDF Editor</Text>
        <Text style={styles.description}>
          Delete, rotate, and reorder pages of any PDF, then save or share the
          result.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handlePick}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon name="file-open" size={18} color={colors.white} />
              <Text style={styles.buttonText}>Choose PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <FeatureBadge
          icon="file-document-edit-outline"
          color={colors.accent}
          size={44}
          variant="solid"
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
          style={styles.resetBtn}
          onPress={handleReset}
          hitSlop={8}>
          <Icon name="restore" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={pages}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.list}
        onDragEnd={({data}) => setPages(data)}
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

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.saveButton, styles.saveButtonSoft]}
          disabled={busy !== null || pages.length === 0}
          onPress={handleSave}>
          {busy === 'save' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Icon name="save" size={18} color={colors.accent} />
              <Text style={[styles.saveButtonText, {color: colors.accent}]}>
                Save PDF
              </Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          disabled={busy !== null || pages.length === 0}
          onPress={handleShare}>
          {busy === 'share' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon name="share" size={18} color={colors.white} />
              <Text style={styles.saveButtonText}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={previewPage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPage(null)}>
        <View style={styles.previewBackdrop}>
          <TouchableOpacity
            style={styles.previewClose}
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
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      backgroundColor: colors.background,
    },
    iconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
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
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      height: 50,
      paddingHorizontal: 28,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    buttonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
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
    saveButton: {
      flex: 1,
      height: 48,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
    },
    saveButtonSoft: {
      backgroundColor: colors.accentMuted,
    },
    saveButtonText: {
      color: colors.white,
      fontWeight: '700',
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
