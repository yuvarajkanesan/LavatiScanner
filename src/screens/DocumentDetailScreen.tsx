import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import Share, {Social} from 'react-native-share';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {
  addPage as addPageRecord,
  createDocument,
  deletePage as deletePageRecord,
  deleteDocument,
  getDocument,
  listPages,
  moveDocumentToFolder,
  renameDocument,
  reorderPages,
  setPageFilePath,
  setPageName,
  setPageNote,
  setPageOcrText,
} from '../db/database';
import {
  copyPageFile,
  deleteDocumentFiles,
  deletePageFile,
  persistPageImage,
} from '../services/fileStorage';
import {
  buildLongImage,
  buildPdfFromImages,
  rotateImageFile90,
} from '../services/pdfExport';
import {recognizeTextFromImage} from '../services/ocr';
import {getMyEmail} from '../services/userSettings';
import {Document, Page} from '../types/models';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {useScanSession} from '../context/ScanSessionContext';
import {promptForText} from '../utils/promptForText';
import {formatDate} from '../utils/format';
import Icon, {IconFamily} from '../components/Icon';
import FeatureBadge from '../components/FeatureBadge';
import FolderPickerModal from '../components/FolderPickerModal';
import OcrModal from '../components/OcrModal';
import PageNoteModal from '../components/PageNoteModal';
import OptionSheet, {SheetOption} from '../components/OptionSheet';
import ZoomableImage from '../components/ZoomableImage';
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

const MORE_ACTIONS: SheetOption[] = [
  {
    key: 'sharePdf',
    label: 'Share PDF',
    icon: f.sharePdf.icon,
    family: f.sharePdf.family,
    color: f.sharePdf.color,
  },
  {
    key: 'shareImage',
    label: 'Share Image',
    icon: f.shareJpg.icon,
    family: f.shareJpg.family,
    color: f.shareJpg.color,
  },
  {
    key: 'email',
    label: 'Email to Myself',
    icon: f.emailMyself.icon,
    family: f.emailMyself.family,
    color: f.emailMyself.color,
  },
  {
    key: 'duplicate',
    label: 'Duplicate Document',
    icon: f.duplicate.icon,
    family: f.duplicate.family,
    color: f.duplicate.color,
  },
  {
    key: 'move',
    label: 'Move to Folder',
    icon: f.moveFolder.icon,
    family: f.moveFolder.family,
    color: f.moveFolder.color,
  },
  {
    key: 'delete',
    label: 'Delete Document',
    icon: f.delete.icon,
    family: f.delete.family,
    color: f.delete.color,
  },
];

const PREVIEW_MORE_ACTIONS: SheetOption[] = [
  {
    key: 'sharePdf',
    label: 'Share PDF',
    icon: f.sharePdf.icon,
    family: f.sharePdf.family,
    color: f.sharePdf.color,
  },
  {
    key: 'shareJpg',
    label: 'Share JPG',
    icon: f.shareJpg.icon,
    family: f.shareJpg.family,
    color: f.shareJpg.color,
  },
  {
    key: 'shareLongImage',
    label: 'Share as long image',
    icon: f.shareLongImage.icon,
    family: f.shareLongImage.family,
    color: f.shareLongImage.color,
  },
  {
    key: 'extractText',
    label: 'Extract Text',
    icon: f.ocr.icon,
    family: f.ocr.family,
    color: f.ocr.color,
  },
  {
    key: 'saveGallery',
    label: 'Save to Gallery',
    icon: f.saveGallery.icon,
    family: f.saveGallery.family,
    color: f.saveGallery.color,
  },
  {
    key: 'email',
    label: 'Email to Myself',
    icon: f.emailMyself.icon,
    family: f.emailMyself.family,
    color: f.emailMyself.color,
  },
  {
    key: 'markup',
    label: 'Markup',
    icon: f.markup.icon,
    family: f.markup.family,
    color: f.markup.color,
  },
];

type PageGridItem = {type: 'page'; page: Page} | {type: 'add'};

export default function DocumentDetailScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {docId} = route.params;
  const session = useScanSession();

  const [doc, setDoc] = useState<Document | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [notePage, setNotePage] = useState<Page | null>(null);
  const [previewPage, setPreviewPage] = useState<Page | null>(null);
  const [rotatingPageId, setRotatingPageId] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [moreBusy, setMoreBusy] = useState<
    'sharePdf' | 'shareImage' | 'email' | 'duplicate' | 'move' | 'delete' | null
  >(null);
  const [previewMoreVisible, setPreviewMoreVisible] = useState(false);
  const [previewBusy, setPreviewBusy] = useState<
    | 'sharePdf'
    | 'shareJpg'
    | 'longImage'
    | 'saveGallery'
    | 'email'
    | 'rotate'
    | null
  >(null);

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

  const gridItems: PageGridItem[] = useMemo(
    () => [
      ...pages.map(page => ({type: 'page' as const, page})),
      {type: 'add' as const},
    ],
    [pages],
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

  // Rotates via a throwaway PDF (pdf-lib sets the rotation, Android's
  // native PdfRenderer rasterizes it back to a JPG) rather than capturing a
  // hidden RN view — the view-capture approach proved unreliable on-device
  // and produced solid-black output. This reuses the same PDF round-trip
  // machinery the PDF editor's rotate/export already relies on correctly.
  async function handleRotatePage(page: Page): Promise<string | null> {
    setRotatingPageId(page.id);
    try {
      const rotatedUri = await rotateImageFile90(
        page.filePath,
        `rot_${page.id}`,
      );
      const newPath = await persistPageImage(docId, rotatedUri);
      await deletePageFile(page.filePath);
      await setPageFilePath(page.id, newPath);
      await load();
      return newPath;
    } catch (error) {
      Alert.alert('Rotate failed', 'Could not rotate this page.');
      return null;
    } finally {
      setRotatingPageId(null);
    }
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

  function handleCropPreview() {
    if (!previewPage) {
      return;
    }
    const page = previewPage;
    setPreviewPage(null);
    navigation.navigate('CropPage', {
      docId,
      pageId: page.id,
      filePath: page.filePath,
    });
  }

  function handleMarkupPreview() {
    if (!previewPage) {
      return;
    }
    const page = previewPage;
    setPreviewPage(null);
    navigation.navigate('MarkupPage', {
      docId,
      pageId: page.id,
      filePath: page.filePath,
    });
  }

  async function handleRotatePreview() {
    if (!previewPage) {
      return;
    }
    const page = previewPage;
    try {
      setPreviewBusy('rotate');
      const newPath = await handleRotatePage(page);
      if (newPath) {
        // Keep the preview open on the same page, just pointing at the
        // freshly rotated file — closing here used to flash the modal shut
        // (and briefly show a black frame) before the grid caught up.
        setPreviewPage({...page, filePath: newPath});
      }
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleSharePreviewImage() {
    if (!previewPage) {
      return;
    }
    try {
      await Share.open({
        url: `file://${previewPage.filePath}`,
        failOnCancel: false,
      });
    } catch (error) {
      // User cancelled or no app could handle it — nothing to surface for
      // a quick share action.
    }
  }

  function handlePreviewSignature() {
    if (!previewPage) {
      return;
    }
    const page = previewPage;
    setPreviewPage(null);
    handleSignPage(page);
  }

  async function handleSharePagePdf(page: Page) {
    if (!doc) {
      return;
    }
    try {
      setPreviewBusy('sharePdf');
      const pdfPath = await buildPdfFromImages(
        [page.filePath],
        `${doc.name}_page`,
      );
      await Share.open({
        url: `file://${pdfPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not share this page as a PDF.');
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleSharePageJpg(page: Page) {
    try {
      setPreviewBusy('shareJpg');
      await Share.open({
        url: `file://${page.filePath}`,
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not share this page.');
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleShareLongImage() {
    if (pages.length === 0 || !doc) {
      return;
    }
    try {
      setPreviewBusy('longImage');
      const imagePath = await buildLongImage(
        pages.map(p => p.filePath),
        `${doc.name}_long`,
      );
      await Share.open({url: `file://${imagePath}`, failOnCancel: false});
    } catch (error) {
      Alert.alert('Share failed', 'Could not build the long image.');
    } finally {
      setPreviewBusy(null);
    }
  }

  async function handleEmailPageToMyself(page: Page) {
    if (!doc) {
      return;
    }
    const email = await getMyEmail();
    if (!email) {
      Alert.alert(
        'No email set',
        'Set your email first in Settings > Sharing > Set my email.',
      );
      return;
    }
    try {
      setPreviewBusy('email');
      const pdfPath = await buildPdfFromImages(
        [page.filePath],
        `${doc.name}_page`,
      );
      await Share.shareSingle({
        social: Social.Email,
        email,
        url: `file://${pdfPath}`,
        subject: doc.name,
        title: doc.name,
      });
    } catch (error) {
      Alert.alert(
        'Could not email',
        'No email app could handle this, or the send was cancelled.',
      );
    } finally {
      setPreviewBusy(null);
    }
  }

  function handlePreviewMoreAction(key: string) {
    const page = previewPage;
    setPreviewMoreVisible(false);
    if (!page) {
      return;
    }
    switch (key) {
      case 'sharePdf':
        handleSharePagePdf(page);
        break;
      case 'shareJpg':
        handleSharePageJpg(page);
        break;
      case 'shareLongImage':
        handleShareLongImage();
        break;
      case 'extractText':
        handleRunOcr(page);
        break;
      case 'saveGallery':
        handleSaveToGallery(page);
        break;
      case 'email':
        handleEmailPageToMyself(page);
        break;
      case 'markup':
        handleMarkupPreview();
        break;
    }
  }

  async function handleShareDocumentPdf() {
    if (pages.length === 0 || !doc) {
      return;
    }
    try {
      setMoreBusy('sharePdf');
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
      Alert.alert('Share failed', 'Could not share this document as a PDF.');
    } finally {
      setMoreBusy(null);
    }
  }

  async function handleShareDocumentImages() {
    if (pages.length === 0) {
      return;
    }
    try {
      setMoreBusy('shareImage');
      await Share.open({
        urls: pages.map(p => `file://${p.filePath}`),
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not share this document as images.');
    } finally {
      setMoreBusy(null);
    }
  }

  async function handleEmailToMyself() {
    if (pages.length === 0 || !doc) {
      return;
    }
    const email = await getMyEmail();
    if (!email) {
      Alert.alert(
        'No email set',
        'Set your email first in Settings > Sharing > Set my email.',
      );
      return;
    }
    try {
      setMoreBusy('email');
      const pdfPath = await buildPdfFromImages(
        pages.map(p => p.filePath),
        doc.name,
      );
      await Share.shareSingle({
        social: Social.Email,
        email,
        url: `file://${pdfPath}`,
        subject: doc.name,
        title: doc.name,
      });
    } catch (error) {
      Alert.alert(
        'Could not email',
        'No email app could handle this, or the send was cancelled.',
      );
    } finally {
      setMoreBusy(null);
    }
  }

  async function handleDuplicateDocument() {
    if (!doc) {
      return;
    }
    try {
      setMoreBusy('duplicate');
      const newDoc = await createDocument(`${doc.name} (Copy)`, doc.folderId);
      for (const page of pages) {
        const newPath = await copyPageFile(newDoc.id, page.filePath);
        await addPageRecord(newDoc.id, newPath);
      }
      navigation.replace('DocumentDetail', {docId: newDoc.id});
    } catch (error) {
      Alert.alert('Duplicate failed', 'Could not duplicate this document.');
    } finally {
      setMoreBusy(null);
    }
  }

  async function handleFolderPicked(folderId: string | null) {
    setFolderPickerVisible(false);
    if (!doc) {
      return;
    }
    setMoreBusy('move');
    await moveDocumentToFolder(doc.id, folderId);
    setMoreBusy(null);
    load();
  }

  function handleDeleteDocument() {
    if (!doc) {
      return;
    }
    Alert.alert(
      'Delete document',
      `Delete "${doc.name}"? This can't be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setMoreBusy('delete');
            await deleteDocument(doc.id);
            await deleteDocumentFiles(doc.id);
            navigation.goBack();
          },
        },
      ],
    );
  }

  function handleMoreAction(key: string) {
    setMoreVisible(false);
    switch (key) {
      case 'sharePdf':
        handleShareDocumentPdf();
        break;
      case 'shareImage':
        handleShareDocumentImages();
        break;
      case 'email':
        handleEmailToMyself();
        break;
      case 'duplicate':
        handleDuplicateDocument();
        break;
      case 'move':
        setFolderPickerVisible(true);
        break;
      case 'delete':
        handleDeleteDocument();
        break;
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
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => setMoreVisible(true)}
          disabled={moreBusy !== null}
          hitSlop={8}>
          {moreBusy !== null ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Icon
              name="more-vert"
              family="material"
              size={22}
              color={colors.textMuted}
            />
          )}
        </TouchableOpacity>
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
          data={gridItems}
          keyExtractor={item =>
            item.type === 'page' ? item.page.id : 'add-tile'
          }
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.list}
          renderItem={({item, index}) =>
            item.type === 'add' ? (
              <TouchableOpacity
                style={styles.addTile}
                onPress={handleAddPage}
                activeOpacity={0.7}>
                <Icon
                  name={f.addPage.icon}
                  family={f.addPage.family}
                  size={26}
                  color={colors.accent}
                />
                <Text style={styles.addTileText}>Add new pages</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.pageCard}
                activeOpacity={0.9}
                onPress={() => setPreviewPage(item.page)}>
                <Image
                  source={{uri: `file://${item.page.filePath}`}}
                  style={styles.pageImage}
                  resizeMode="cover"
                />
                <View style={styles.pageScrim} pointerEvents="none" />
                <View style={styles.pageBadge}>
                  <Icon
                    name="file-document-outline"
                    family="community"
                    size={12}
                    color={colors.white}
                  />
                  <Text style={styles.pageBadgeText} numberOfLines={1}>
                    {item.page.pageName || `Page ${index + 1}`}
                  </Text>
                </View>
                {item.page.note ? (
                  <View style={styles.noteBadge}>
                    <Icon
                      name={f.note.icon}
                      family={f.note.family}
                      size={13}
                      color={colors.white}
                    />
                  </View>
                ) : null}
                {rotatingPageId === item.page.id ? (
                  <View style={styles.rotatingOverlay}>
                    <ActivityIndicator color={colors.white} />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.pageMenuBtn}
                    onPress={() => setActivePage(item.page)}
                    hitSlop={8}>
                    <Icon
                      name="dots-vertical"
                      family="community"
                      size={20}
                      color={colors.white}
                    />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          }
        />
      )}

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
          {previewPage && (
            <ZoomableImage
              uri={`file://${previewPage.filePath}`}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.previewToolbar}>
            <PreviewToolbarButton
              icon={f.crop.icon}
              family={f.crop.family}
              label="Crop"
              disabled={previewBusy !== null}
              onPress={handleCropPreview}
            />
            <PreviewToolbarButton
              icon={f.rotate.icon}
              family={f.rotate.family}
              label="Rotate"
              disabled={previewBusy !== null}
              loading={previewBusy === 'rotate'}
              onPress={handleRotatePreview}
            />
            <PreviewToolbarButton
              icon="share"
              family="material"
              label="Share"
              disabled={previewBusy !== null}
              onPress={handleSharePreviewImage}
            />
            <PreviewToolbarButton
              icon={f.sign.icon}
              family={f.sign.family}
              label="Signature"
              disabled={previewBusy !== null}
              onPress={handlePreviewSignature}
            />
            <PreviewToolbarButton
              icon="more-horiz"
              family="material"
              label="More"
              loading={previewBusy !== null}
              onPress={() => setPreviewMoreVisible(true)}
            />
          </View>
        </View>
      </Modal>

      <OptionSheet
        visible={previewMoreVisible}
        title={previewPage ? `Page ${previewPage.pageIndex + 1}` : ''}
        options={PREVIEW_MORE_ACTIONS}
        selectedKey=""
        onSelect={handlePreviewMoreAction}
        onClose={() => setPreviewMoreVisible(false)}
      />

      <OptionSheet
        visible={activePage !== null}
        title={activePage ? `Page ${activePage.pageIndex + 1}` : ''}
        options={PAGE_ACTIONS}
        selectedKey=""
        onSelect={handlePageAction}
        onClose={() => setActivePage(null)}
      />

      <OptionSheet
        visible={moreVisible}
        title={doc.name}
        options={MORE_ACTIONS}
        selectedKey=""
        onSelect={handleMoreAction}
        onClose={() => setMoreVisible(false)}
      />

      <FolderPickerModal
        visible={folderPickerVisible}
        currentFolderId={doc.folderId}
        onClose={() => setFolderPickerVisible(false)}
        onPick={handleFolderPicked}
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
    </View>
  );
}

interface PreviewToolbarButtonProps {
  icon: string;
  family?: IconFamily;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function PreviewToolbarButton({
  icon,
  family,
  label,
  onPress,
  disabled,
  loading,
}: PreviewToolbarButtonProps) {
  return (
    <TouchableOpacity
      style={[
        previewToolbarStyles.btn,
        disabled && previewToolbarStyles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Icon name={icon} family={family} size={24} color="#FFFFFF" />
      )}
      <Text style={previewToolbarStyles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const previewToolbarStyles = StyleSheet.create({
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
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
    moreBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
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
    },
    gridRow: {
      justifyContent: 'space-between',
    },
    pageCard: {
      width: '48%',
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
    addTile: {
      width: '48%',
      aspectRatio: 0.72,
      borderRadius: 18,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      gap: 8,
    },
    addTileText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
      paddingHorizontal: 8,
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
    previewImage: {
      flex: 1,
      margin: 16,
    },
    previewToolbar: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 8,
      paddingBottom: 20,
    },
  });
