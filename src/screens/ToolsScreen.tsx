import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Alert from '../utils/customAlert';
import {TabScreenProps} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {pickImportFiles} from '../services/filePicker';
import {isPdfRenderable} from '../services/pdfEdit';
import {renderAllPdfPages} from '../services/pdfThumbnail';
import {saveSessionAsDocument} from '../services/scanPipeline';
import {scanTimestampName} from '../utils/format';
import FeatureBadge from '../components/FeatureBadge';
import ScreenBackground from '../components/ScreenBackground';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {toolIcons} from '../theme/toolIcons';
import {PercentWidth, percentWidth, useResponsive} from '../utils/responsive';

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
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Scan">
          <Grid shortcuts={scanShortcuts} />
        </Section>
        <Section title="Process Files">
          <Grid shortcuts={fileShortcuts} busyKey={importing ? 'import' : null} />
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

function Grid({
  shortcuts,
  busyKey,
}: {
  shortcuts: Shortcut[];
  busyKey?: string | null;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {toolColumns} = useResponsive();
  const cardWidthPercent = percentWidth(100 / toolColumns - 3);
  return (
    <View style={styles.grid}>
      {shortcuts.map(s => (
        <ToolCard
          key={s.key}
          shortcut={s}
          busy={busyKey === s.key}
          styles={styles}
          widthPercent={cardWidthPercent}
        />
      ))}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ToolCard({
  shortcut,
  busy,
  styles,
  widthPercent,
}: {
  shortcut: Shortcut;
  busy: boolean;
  styles: ReturnType<typeof createStyles>;
  widthPercent: PercentWidth;
}) {
  const {colors} = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));
  const token = toolIcons[shortcut.key as keyof typeof toolIcons];

  return (
    <AnimatedPressable
      style={[styles.card, {width: widthPercent}, animatedStyle]}
      onPress={shortcut.onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, {damping: 15, stiffness: 400});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, {damping: 15, stiffness: 400});
      }}>
      {busy ? (
        <View style={styles.cardIconWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FeatureBadge
          icon={token?.icon ?? shortcut.icon}
          family={token?.family}
          color={token?.color ?? colors.accent}
          size={44}
          variant="soft"
        />
      )}
      <Text style={styles.cardLabel}>{shortcut.label}</Text>
    </AnimatedPressable>
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
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    card: {
      width: '30%',
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 3,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.1,
      shadowRadius: 5,
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
