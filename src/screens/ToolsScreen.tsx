import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import Alert from '../utils/customAlert';
import {TabScreenProps} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {importFilesAsDocuments} from '../services/importFiles';
import ScreenBackground from '../components/ScreenBackground';
import ToolGrid, {ToolShortcut} from '../components/ToolGrid';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = TabScreenProps<'Tools'>;
type Shortcut = ToolShortcut;

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
      const {createdDocIds, skipped} = await importFilesAsDocuments(null);

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
      onPress: () =>
        navigation.navigate('Scan', {folderId: null, mode: 'idcard'}),
    },
    {
      key: 'book',
      icon: 'menu-book',
      label: 'Book',
      onPress: () =>
        navigation.navigate('Scan', {folderId: null, mode: 'book'}),
    },
    {
      key: 'qrcode',
      icon: 'qr-code-scanner',
      label: 'QR Code',
      onPress: () => navigation.navigate('Scan', {mode: 'qrcode'}),
    },
    {
      key: 'totext',
      icon: 'text-fields',
      label: 'To Text',
      onPress: () => navigation.navigate('Scan', {mode: 'totext'}),
    },
  ];

  const fileShortcuts: Shortcut[] = [
    {
      key: 'folders',
      icon: 'folder',
      label: 'Folders',
      onPress: () => navigation.navigate('AllFiles'),
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
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Scan">
          <ToolGrid shortcuts={scanShortcuts} />
        </Section>
        <Section title="Process Files">
          <ToolGrid
            shortcuts={fileShortcuts}
            busyKey={importing ? 'import' : null}
          />
        </Section>
      </ScrollView>
    </ScreenBackground>
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

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
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
  });
