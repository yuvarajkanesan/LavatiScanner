import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useScanSession } from '../context/ScanSessionContext';
import Icon from '../components/Icon';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanLauncher'>;

type ScanMode = 'book' | 'totext' | 'docs' | 'idcard' | 'qrcode';

interface ModeOption {
  key: ScanMode;
  label: string;
  icon: string;
  title: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    key: 'book',
    label: 'Book',
    icon: 'menu-book',
    title: 'Book',
    description: 'Capture a two-page spread and split it into separate pages automatically.',
  },
  {
    key: 'totext',
    label: 'To Text',
    icon: 'text-fields',
    title: 'To Text',
    description: 'Snap a photo and get the text extracted instantly, ready to copy.',
  },
  {
    key: 'docs',
    label: 'Docs',
    icon: 'description',
    title: 'Docs',
    description: 'Auto-detect edges, capture as many pages as you need, then apply a filter.',
  },
  {
    key: 'idcard',
    label: 'ID Card',
    icon: 'badge',
    title: 'ID Card',
    description: 'Single side, front-and-back, or passport — a ready-to-print e-copy in under a minute.',
  },
  {
    key: 'qrcode',
    label: 'QR Code',
    icon: 'qr-code-scanner',
    title: 'QR Code',
    description: 'Photograph a QR code or barcode to read what it contains.',
  },
];

export default function ScanLauncherScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useScanSession();
  const folderId = route.params?.folderId ?? null;
  const [mode, setMode] = useState<ScanMode>('docs');

  const activeMode = MODES.find(m => m.key === mode)!;

  function handleSelectMode(nextMode: ScanMode) {
    setMode(nextMode);
    switch (nextMode) {
      case 'docs':
        session.startSession(folderId);
        navigation.replace('Scan', { folderId });
        break;
      case 'book':
        navigation.replace('BookScan', { folderId });
        break;
      case 'idcard':
        navigation.replace('IdCardScan', { folderId });
        break;
      case 'qrcode':
        navigation.replace('QrScan');
        break;
      case 'totext':
        navigation.replace('QuickText');
        break;
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan</Text>
        <View style={{ width: 24 }} />
      </View>

      <TouchableOpacity
        style={styles.body}
        activeOpacity={0.85}
        onPress={() => handleSelectMode(mode)}>
        <View style={styles.previewCard}>
          <View style={styles.previewIconWrap}>
            <Icon name={activeMode.icon} size={40} color={colors.accent} />
          </View>
          <Text style={styles.previewTitle}>{activeMode.title}</Text>
          <Text style={styles.previewDescription}>{activeMode.description}</Text>
          <Text style={styles.previewHint}>Tap anywhere to start scanning</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.modeBar, { paddingBottom: 14 + insets.bottom }]}>
        {MODES.map(m => {
          const active = m.key === mode;
          return (
            <TouchableOpacity key={m.key} style={styles.modeTab} onPress={() => handleSelectMode(m.key)}>
              <Icon name={m.icon} size={20} color={active ? colors.accent : '#8A8A8A'} />
              <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  body: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  previewIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(28,160,222,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  previewDescription: {
    marginTop: 8,
    fontSize: 13,
    color: '#9AA0A6',
    textAlign: 'center',
    lineHeight: 19,
  },
  previewHint: {
    marginTop: 18,
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    backgroundColor: '#111111',
  },
  modeTab: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    gap: 6,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
  },
  modeTabTextActive: {
    color: colors.accent,
  },
});
