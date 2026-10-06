import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Alert from '../utils/customAlert';
import {TabScreenProps} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {importFilesAsDocuments} from '../services/importFiles';
import Icon from '../components/Icon';
import ScreenBackground from '../components/ScreenBackground';
import ToolGrid, {ToolShortcut} from '../components/ToolGrid';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = TabScreenProps<'Tools'>;
type Shortcut = ToolShortcut;

export default function ToolsScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const session = useScanSession();
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');

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
      label: 'Remove Password',
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

  const q = query.trim().toLowerCase();
  const filteredScan = q
    ? scanShortcuts.filter(s => s.label.toLowerCase().includes(q))
    : scanShortcuts;
  const filteredFiles = q
    ? fileShortcuts.filter(s => s.label.toLowerCase().includes(q))
    : fileShortcuts;

  return (
    <ScreenBackground>
      <View style={[styles.heroHeader, {paddingTop: insets.top + 10}]}>
        <Text style={styles.heroTitle}>Tools</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Icon name="search" size={20} color="rgba(255,255,255,0.75)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tools"
              placeholderTextColor="rgba(255,255,255,0.75)"
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {filteredScan.length > 0 && (
          <Section title="Scan">
            <ToolGrid shortcuts={filteredScan} />
          </Section>
        )}
        {filteredFiles.length > 0 && (
          <Section title="Process files">
            <ToolGrid
              shortcuts={filteredFiles}
              busyKey={importing ? 'import' : null}
            />
          </Section>
        )}
        {filteredScan.length === 0 && filteredFiles.length === 0 && (
          <Text style={styles.noMatches}>No tools match "{query}".</Text>
        )}
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
    heroHeader: {
      backgroundColor: colors.accent,
      paddingBottom: 16,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.white,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.white,
      padding: 0,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 10,
      marginLeft: 4,
    },
    noMatches: {
      marginTop: 40,
      textAlign: 'center',
      fontSize: 14,
      color: colors.textMuted,
    },
  });
