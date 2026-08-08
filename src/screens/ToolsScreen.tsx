import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {TabScreenProps} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {pickImportFiles} from '../services/filePicker';
import {isPdfRenderable} from '../services/pdfEdit';
import {renderAllPdfPages} from '../services/pdfThumbnail';
import {saveSessionAsDocument} from '../services/scanPipeline';
import {scanTimestampName} from '../utils/format';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

type Props = TabScreenProps<'Tools'>;

interface Shortcut {
  key: string;
  icon: string;
  label: string;
  onPress: () => void | Promise<void>;
}

export default function ToolsScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const session = useScanSession();
  const [importing, setImporting] = useState(false);

  function startScan() {
    session.startSession(null);
    navigation.navigate('Scan', {folderId: null});
  }

  async function handleImportFiles() {
    try {
      setImporting(true);
      const {images, pdfs} = await pickImportFiles();
      if (images.length === 0 && pdfs.length === 0) {
        return;
      }

      const createdDocIds: string[] = [];
      const skipped: string[] = [];

      // Each picked file becomes its own document, not one merged document.
      for (const image of images) {
        const docId = await saveSessionAsDocument({
          docName: stripExtension(image.name) || scanTimestampName(),
          folderId: null,
          pages: [{id: 'import-0', rawUri: image.uri, filter: 'original'}],
        });
        createdDocIds.push(docId);
      }

      for (const pdf of pdfs) {
        // Android's native page renderer throws an uncaught exception (not a
        // rejected promise) for any encrypted PDF, which would crash past a
        // try/catch here — so encrypted files are filtered out before ever
        // reaching it.
        if (!(await isPdfRenderable(pdf.uri))) {
          skipped.push(pdf.name);
          continue;
        }
        try {
          const rendered = await renderAllPdfPages(pdf.uri);
          const docId = await saveSessionAsDocument({
            docName: stripExtension(pdf.name) || scanTimestampName(),
            folderId: null,
            pages: rendered.map((r, i) => ({
              id: `import-${i}`,
              rawUri: r.uri,
              filter: 'original',
            })),
          });
          createdDocIds.push(docId);
        } catch (pdfError) {
          skipped.push(pdf.name);
        }
      }

      if (createdDocIds.length === 0) {
        if (skipped.length > 0) {
          Alert.alert(
            'Import failed',
            `Could not open: ${skipped.join(
              ', ',
            )}. The file may be password-protected.`,
          );
        }
        return;
      }

      if (skipped.length > 0) {
        Alert.alert(
          'Some files skipped',
          `Could not open: ${skipped.join(
            ', ',
          )}. The rest were imported as separate documents.`,
        );
      }

      if (createdDocIds.length === 1) {
        navigation.navigate('DocumentDetail', {docId: createdDocIds[0]});
      } else {
        navigation.navigate('Home');
      }
    } catch (error) {
      Alert.alert('Import failed', 'Could not import the selected files.');
    } finally {
      setImporting(false);
    }
  }

  const scanShortcuts: Shortcut[] = [
    {key: 'docs', icon: 'description', label: 'Scan Docs', onPress: startScan},
    {
      key: 'idcard',
      icon: 'badge',
      label: 'ID Card',
      onPress: () => navigation.navigate('IdCardScan', {folderId: null}),
    },
    {
      key: 'book',
      icon: 'menu-book',
      label: 'Book',
      onPress: () => navigation.navigate('BookScan', {folderId: null}),
    },
    {
      key: 'qrcode',
      icon: 'qr-code-scanner',
      label: 'QR Code',
      onPress: () => navigation.navigate('QrScan'),
    },
    {
      key: 'totext',
      icon: 'text-fields',
      label: 'To Text',
      onPress: () => navigation.navigate('QuickText'),
    },
  ];

  const fileShortcuts: Shortcut[] = [
    {
      key: 'folders',
      icon: 'folder',
      label: 'Folders',
      onPress: () => navigation.navigate('Folders'),
    },
    {
      key: 'import',
      icon: 'file-upload',
      label: 'Import Files',
      onPress: handleImportFiles,
    },
    {
      key: 'merge',
      icon: 'call-merge',
      label: 'PDF Merge',
      onPress: () => navigation.navigate('PdfMerge'),
    },
    {
      key: 'editor',
      icon: 'edit-document',
      label: 'PDF Editor',
      onPress: () => navigation.navigate('PdfEditor'),
    },
    {
      key: 'sign',
      icon: 'draw',
      label: 'Sign PDF',
      onPress: () => navigation.navigate('SignPdf'),
    },
    {
      key: 'unlock',
      icon: 'lock-open',
      label: 'Remove Restrictions',
      onPress: () => navigation.navigate('PdfPasswordRemove'),
    },
    {
      key: 'collage',
      icon: 'grid-view',
      label: 'Collage Images',
      onPress: () => navigation.navigate('Collage'),
    },
    {
      key: 'watermark',
      icon: 'branding-watermark',
      label: 'PDF Watermark',
      onPress: () => navigation.navigate('PdfWatermark'),
    },
    {
      key: 'compression',
      icon: 'compress',
      label: 'Compression',
      onPress: () => navigation.navigate('Compression'),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Scan">
        <Grid shortcuts={scanShortcuts} />
      </Section>
      <Section title="Process Files">
        <Grid shortcuts={fileShortcuts} busyKey={importing ? 'import' : null} />
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Grid({
  shortcuts,
  busyKey,
}: {
  shortcuts: Shortcut[];
  busyKey?: string | null;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.grid}>
      {shortcuts.map(s => (
        <TouchableOpacity
          key={s.key}
          style={styles.card}
          onPress={s.onPress}
          activeOpacity={0.7}>
          <View style={styles.cardIconWrap}>
            {busyKey === s.key ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Icon name={s.icon} size={26} color={colors.accent} />
            )}
          </View>
          <Text style={styles.cardLabel}>{s.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 10,
      marginLeft: 4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    card: {
      width: '30%',
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardLabel: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
