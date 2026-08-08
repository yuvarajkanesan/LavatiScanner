import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  PixelRatio,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Share from 'react-native-share';
import {captureRef} from 'react-native-view-shot';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {
  deletePage as deletePageRecord,
  getDocument,
  listPages,
  renameDocument,
  reorderPages,
  setPageFilePath,
  setPageName,
  setPageNote,
  setPageOcrText,
} from '../db/database';
import {deletePageFile, persistPageImage} from '../services/fileStorage';
import {buildPdfFromImages} from '../services/pdfExport';
import {recognizeTextFromImage} from '../services/ocr';
import {Document, Page} from '../types/models';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {useScanSession} from '../context/ScanSessionContext';
import {promptForText} from '../utils/promptForText';
import {formatDate} from '../utils/format';
import Icon, {IconFamily} from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import OcrModal from '../components/OcrModal';
import PageNoteModal from '../components/PageNoteModal';
import OptionSheet, {SheetOption} from '../components/OptionSheet';
import {documentFeatureIcons as f} from '../theme/featureIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'DocumentDetail'>;

const PAGE_ACTIONS: SheetOption[] = [
  {
    key: 'ocr',
    label: 'Extract Text (OCR)',
    icon: f.ocr.icon,
    family: f.ocr.family,
    color: f.ocr.color,
  },
  {
    key: 'sign',
    label: 'Sign This Page',
    icon: f.sign.icon,
    family: f.sign.family,
    color: f.sign.color,
  },
  {
    key: 'pageName',
    label: 'Page Name',
    icon: f.pageName.icon,
    family: f.pageName.family,
    color: f.pageName.color,
  },
  {
    key: 'note',
    label: 'Note',
    icon: f.note.icon,
    family: f.note.family,
    color: f.note.color,
  },
  {
    key: 'rotate',
    label: 'Rotate Page',
    icon: f.rotate.icon,
    family: f.rotate.family,
    color: f.rotate.color,
  },
  {
    key: 'saveGallery',
    label: 'Save to Gallery',
    icon: f.saveGallery.icon,
    family: f.saveGallery.family,
    color: f.saveGallery.color,
  },
  {
    key: 'moveUp',
    label: 'Move Up',
    icon: f.moveUp.icon,
    family: f.moveUp.family,
    color: f.moveUp.color,
  },
  {
    key: 'moveDown',
    label: 'Move Down',
    icon: f.moveDown.icon,
    family: f.moveDown.family,
    color: f.moveDown.color,
  },
  {
    key: 'delete',
    label: 'Delete Page',
    icon: f.delete.icon,
    family: f.delete.family,
    color: f.delete.color,
  },
];

export default function DocumentDetailScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {docId} = route.params;
  const session = useScanSession();

  const [doc, setDoc] = useState<Document | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<
    'export' | 'share' | 'jpg' | 'editPdf' | null
  >(null);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [notePage, setNotePage] = useState<Page | null>(null);
  const [rotatingPageId, setRotatingPageId] = useState<string | null>(null);
  const [rotateCapture, setRotateCapture] = useState<{
    page: Page;
    width: number;
    height: number;
  } | null>(null);
  const rotateCaptureRef = useRef<View>(null);

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([getDocument(docId), listPages(docId)]);
    setDoc(d);
    setPages(p);
    setLoading(false);
  }, [docId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRenameDoc() {
    if (!doc) {
      return;
    }
    const name = await promptForText('Rename document', doc.name);
    if (name && name.trim()) {
      await renameDocument(doc.id, name.trim());
      load();
    }
  }

  function handleAddPage() {
    session.startAppendSession(docId);
    navigation.navigate('Scan', {folderId: null});
  }

  async function handleDeletePage(page: Page) {
    await deletePageRecord(page.id, docId);
    await deletePageFile(page.filePath);
    load();
  }

  async function handleMovePage(page: Page, direction: 'up' | 'down') {
    const index = pages.findIndex(p => p.id === page.id);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= pages.length) {
      return;
    }
    const reordered = [...pages];
    [reordered[index], reordered[swapWith]] = [
      reordered[swapWith],
      reordered[index],
    ];
    setPages(reordered);
    await reorderPages(
      docId,
      reordered.map(p => p.id),
    );
  }

  function handleRotatePage(page: Page) {
    setRotatingPageId(page.id);
    Image.getSize(
      `file://${page.filePath}`,
      (width, height) => setRotateCapture({page, width, height}),
      () => {
        setRotatingPageId(null);
        Alert.alert('Rotate failed', 'Could not read this page image.');
      },
    );
  }

  // Bakes a 90° clockwise rotation into the page's actual JPG bytes (rather
  // than storing rotation as metadata) so the thumbnail, PDF export, and
  // "Share Image" all stay correct with no extra handling anywhere else.
  const finishRotateCapture = useCallback(async () => {
    if (!rotateCapture) {
      return;
    }
    const {page} = rotateCapture;
    try {
      const tempPath = await captureRef(rotateCaptureRef, {
        format: 'jpg',
        quality: 0.92,
      });
      const newPath = await persistPageImage(docId, tempPath);
      await deletePageFile(page.filePath);
      await setPageFilePath(page.id, newPath);
      await load();
    } catch (error) {
      Alert.alert('Rotate failed', 'Could not rotate this page.');
    } finally {
      setRotateCapture(null);
      setRotatingPageId(null);
    }
  }, [rotateCapture, docId, load]);

  // Driven by the hidden Image's onLoad rather than a fixed delay, since a
  // guessed timeout could fire before a large scanned photo has actually
  // decoded and painted, capturing a blank frame. The double rAF gives the
  // native side one extra frame to composite the just-loaded bitmap.
  function handleRotateImageLoaded() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        finishRotateCapture();
      });
    });
  }

  function handleRotateImageError() {
    setRotateCapture(null);
    setRotatingPageId(null);
    Alert.alert('Rotate failed', 'Could not rotate this page.');
  }

  async function handleRunOcr(page: Page) {
    setOcrVisible(true);
    setOcrLoading(true);
    setOcrText('');
    try {
      const text = await recognizeTextFromImage(page.filePath);
      setOcrText(text);
      await setPageOcrText(page.id, text);
    } catch (error) {
      setOcrText('');
      Alert.alert('OCR failed', 'Could not extract text from this page.');
    } finally {
      setOcrLoading(false);
    }
  }

  function handleSignPage(page: Page) {
    navigation.navigate('SignPage', {
      docId,
      pageId: page.id,
      filePath: page.filePath,
    });
  }

  async function handleSaveToGallery(page: Page) {
    try {
      await CameraRoll.saveAsset(`file://${page.filePath}`, {
        type: 'photo',
        album: 'Lavati Scanner',
      });
      Alert.alert('Saved', 'The page image was saved to your gallery.');
    } catch (error) {
      Alert.alert('Save failed', 'Could not save this page to your gallery.');
    }
  }

  async function handlePageNameEdit(page: Page) {
    const name = await promptForText(
      'Page name',
      page.pageName ?? `Page ${page.pageIndex + 1}`,
    );
    if (name !== null) {
      await setPageName(page.id, name.trim() || null);
      load();
    }
  }

  async function handleSaveNote(note: string) {
    if (!notePage) {
      return;
    }
    await setPageNote(notePage.id, note || null);
    setNotePage(null);
    load();
  }

  function handlePageAction(key: string) {
    const page = activePage;
    setActivePage(null);
    if (!page) {
      return;
    }
    switch (key) {
      case 'ocr':
        handleRunOcr(page);
        break;
      case 'sign':
        handleSignPage(page);
        break;
      case 'pageName':
        handlePageNameEdit(page);
        break;
      case 'note':
        setNotePage(page);
        break;
      case 'rotate':
        handleRotatePage(page);
        break;
      case 'saveGallery':
        handleSaveToGallery(page);
        break;
      case 'moveUp':
        handleMovePage(page, 'up');
        break;
      case 'moveDown':
        handleMovePage(page, 'down');
        break;
      case 'delete':
        Alert.alert('Delete page', `Delete page ${page.pageIndex + 1}?`, [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleDeletePage(page),
          },
        ]);
        break;
    }
  }

  async function handleExportPdf() {
    if (pages.length === 0 || !doc) {
      return;
    }
    try {
      setExporting('export');
      await buildPdfFromImages(
        pages.map(p => p.filePath),
        doc.name,
      );
      Alert.alert(
        'PDF saved',
        'The PDF was saved. Use "Share PDF" to send it.',
      );
    } catch (error) {
      Alert.alert(
        'Export failed',
        'Could not build the PDF for this document.',
      );
    } finally {
      setExporting(null);
    }
  }

  async function handleEditPdf() {
    if (pages.length === 0 || !doc) {
      return;
    }
    try {
      setExporting('editPdf');
      const pdfPath = await buildPdfFromImages(
        pages.map(p => p.filePath),
        doc.name,
      );
      navigation.navigate('PdfEditor', {
        uri: `file://${pdfPath}`,
        name: `${doc.name}.pdf`,
      });
    } catch (error) {
      Alert.alert(
        'Could not open editor',
        'Could not build the PDF for this document.',
      );
    } finally {
      setExporting(null);
    }
  }

  async function handleSharePdf() {
    if (pages.length === 0 || !doc) {
      return;
    }
    try {
      setExporting('share');
      const pdfPath = await buildPdfFromImages(
        pages.map(p => p.filePath),
        doc.name,
      );
      await Share.open({
        url: `file://${pdfPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not share the PDF for this document.');
    } finally {
      setExporting(null);
    }
  }

  async function handleShareImages() {
    if (pages.length === 0) {
      return;
    }
    try {
      setExporting('jpg');
      await Share.open({
        urls: pages.map(p => `file://${p.filePath}`),
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not share the page images.');
    } finally {
      setExporting(null);
    }
  }

  if (loading || !doc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <FeatureBadge
          icon="file-document-outline"
          color={colors.accent}
          size={46}
          variant="solid"
        />
        <View style={styles.heroTextWrap}>
          <TouchableOpacity
            style={styles.titleRow}
            onPress={handleRenameDoc}
            activeOpacity={0.7}>
            <Text style={styles.title} numberOfLines={1}>
              {doc.name}
            </Text>
            <Icon
              name={f.rename.icon}
              family={f.rename.family}
              size={15}
              color={colors.accent}
            />
          </TouchableOpacity>
          <View style={styles.subtitleRow}>
            <Icon
              name="file-multiple-outline"
              family="community"
              size={13}
              color={colors.textMuted}
            />
            <Text style={styles.subtitle}>
              {pages.length} page{pages.length === 1 ? '' : 's'}
            </Text>
            <View style={styles.subtitleDot} />
            <Text style={styles.subtitle}>{formatDate(doc.updatedAt)}</Text>
          </View>
        </View>
      </View>

      {pages.length === 0 ? (
        <View style={styles.empty}>
          <FeatureBadge
            icon="image-plus"
            color={colors.accent}
            size={72}
            variant="soft"
          />
          <Text style={styles.emptyTitle}>No pages yet</Text>
          <Text style={styles.emptyText}>
            Add your first page to start building this document.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={handleAddPage}
            activeOpacity={0.85}>
            <Icon
              name={f.addPage.icon}
              family={f.addPage.family}
              size={18}
              color={colors.white}
            />
            <Text style={styles.emptyBtnText}>Add Page</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({item, index}) => (
            <View style={styles.pageCard}>
              <Image
                source={{uri: `file://${item.filePath}`}}
                style={styles.pageImage}
                resizeMode="contain"
              />
              <View style={styles.pageScrim} pointerEvents="none" />
              <View style={styles.pageBadge}>
                <Icon
                  name="file-document-outline"
                  family="community"
                  size={12}
                  color={colors.white}
                />
                <Text style={styles.pageBadgeText}>
                  {item.pageName || `Page ${index + 1}`}
                </Text>
              </View>
              {item.note ? (
                <View style={styles.noteBadge}>
                  <Icon
                    name={f.note.icon}
                    family={f.note.family}
                    size={13}
                    color={colors.white}
                  />
                </View>
              ) : null}
              {rotatingPageId === item.id ? (
                <View style={styles.rotatingOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.pageMenuBtn}
                  onPress={() => setActivePage(item)}
                  hitSlop={8}>
                  <Icon
                    name="dots-vertical"
                    family="community"
                    size={20}
                    color={colors.white}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      <View style={styles.actionBar}>
        <View style={styles.actionRow}>
          <ActionButton
            icon={f.exportPdf.icon}
            family={f.exportPdf.family}
            color={f.exportPdf.color}
            label="Export PDF"
            loading={exporting === 'export'}
            disabled={exporting !== null}
            onPress={handleExportPdf}
          />
          <ActionButton
            icon={f.sharePdf.icon}
            family={f.sharePdf.family}
            color={f.sharePdf.color}
            label="Share PDF"
            loading={exporting === 'share'}
            disabled={exporting !== null}
            onPress={handleSharePdf}
          />
          <ActionButton
            icon={f.editPdf.icon}
            family={f.editPdf.family}
            color={f.editPdf.color}
            label="Edit PDF"
            loading={exporting === 'editPdf'}
            disabled={exporting !== null}
            onPress={handleEditPdf}
          />
        </View>
        <View style={styles.actionRow}>
          <ActionButton
            icon={f.shareImage.icon}
            family={f.shareImage.family}
            color={f.shareImage.color}
            label="Share Image"
            loading={exporting === 'jpg'}
            disabled={exporting !== null}
            onPress={handleShareImages}
          />
          <ActionButton
            icon={f.addPage.icon}
            family={f.addPage.family}
            color={f.addPage.color}
            label="Add Page"
            disabled={exporting !== null}
            onPress={handleAddPage}
          />
          <View style={actionButtonStyles.spacer} />
        </View>
      </View>

      <OptionSheet
        visible={activePage !== null}
        title={activePage ? `Page ${activePage.pageIndex + 1}` : ''}
        options={PAGE_ACTIONS}
        selectedKey=""
        onSelect={handlePageAction}
        onClose={() => setActivePage(null)}
      />

      <OcrModal
        visible={ocrVisible}
        loading={ocrLoading}
        text={ocrText}
        onClose={() => setOcrVisible(false)}
      />

      <PageNoteModal
        visible={notePage !== null}
        initialValue={notePage?.note ?? ''}
        onSave={handleSaveNote}
        onClose={() => setNotePage(null)}
      />

      {rotateCapture && (
        <View style={styles.rotateCaptureHost} pointerEvents="none">
          <View
            ref={rotateCaptureRef}
            collapsable={false}
            style={{
              width: rotateCapture.height / PixelRatio.get(),
              height: rotateCapture.width / PixelRatio.get(),
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Image
              source={{uri: `file://${rotateCapture.page.filePath}`}}
              style={{
                width: rotateCapture.width / PixelRatio.get(),
                height: rotateCapture.height / PixelRatio.get(),
                transform: [{rotate: '90deg'}],
              }}
              resizeMode="contain"
              onLoad={handleRotateImageLoaded}
              onError={handleRotateImageError}
            />
          </View>
        </View>
      )}
    </View>
  );
}

interface ActionButtonProps {
  icon: string;
  family?: IconFamily;
  color: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function ActionButton({
  icon,
  family,
  color,
  label,
  onPress,
  disabled,
  loading,
}: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        actionButtonStyles.btn,
        {backgroundColor: `${color}14`},
        disabled && actionButtonStyles.btnDisabled,
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
          <Text style={[actionButtonStyles.label, {color}]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const actionButtonStyles = StyleSheet.create({
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
  spacer: {
    flex: 1,
  },
});

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
      backgroundColor: colors.background,
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
    heroTextWrap: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      flexShrink: 1,
    },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
    },
    subtitleDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.textMuted,
      marginHorizontal: 2,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 6,
    },
    emptyTitle: {
      marginTop: 14,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 10,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 100,
    },
    emptyBtnText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 14,
    },
    list: {
      padding: 16,
      paddingBottom: 24,
      gap: 16,
    },
    pageCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 16,
      elevation: 2,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    pageImage: {
      width: '100%',
      aspectRatio: 0.72,
      backgroundColor: colors.border,
    },
    pageScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 56,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    pageBadge: {
      position: 'absolute',
      left: 10,
      top: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 100,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    pageBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    pageMenuBtn: {
      position: 'absolute',
      right: 10,
      top: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteBadge: {
      position: 'absolute',
      left: 10,
      bottom: 10,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: f.note.color,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rotatingOverlay: {
      position: 'absolute',
      right: 10,
      top: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rotateCaptureHost: {
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: 0,
    },
    actionBar: {
      padding: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
    },
  });
