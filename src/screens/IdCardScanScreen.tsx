import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { createDocument, addPage as addPageRecord } from '../db/database';
import { persistPageImage } from '../services/fileStorage';
import { scanTimestampName } from '../utils/format';
import Icon from '../components/Icon';
import IdCardIllustration from '../components/IdCardIllustration';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'IdCardScan'>;

type SubMode = 'single' | 'twoSided' | 'passport';
type Step = 'select' | 'front' | 'back' | 'review';

interface SubModeOption {
  key: SubMode;
  label: string;
  icon: string;
  docPrefix: string;
  description: string;
}

const SUB_MODES: SubModeOption[] = [
  {
    key: 'single',
    label: 'Single Side',
    icon: 'credit-card',
    docPrefix: 'Card',
    description: 'One quick shot of a single-sided card.',
  },
  {
    key: 'twoSided',
    label: 'Driver Licence',
    icon: 'badge',
    docPrefix: 'ID',
    description: 'Capture front, then back — combined into one 2-sided e-copy.',
  },
  {
    key: 'passport',
    label: 'Passport',
    icon: 'menu-book',
    docPrefix: 'Passport',
    description: 'One shot of the passport photo page.',
  },
];

export default function IdCardScanScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [subMode, setSubMode] = useState<SubMode>('twoSided');
  const [step, setStep] = useState<Step>('select');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const compositeRef = useRef<View>(null);

  const activeMode = SUB_MODES.find(m => m.key === subMode)!;

  async function handleMakeItNow() {
    if (subMode === 'twoSided') {
      setStep('front');
      await captureSide('front');
    } else {
      await captureSingle();
    }
  }

  async function captureSide(side: 'front' | 'back') {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) {
        setStep('select');
        return;
      }

      if (side === 'front') {
        setFrontUri(scannedImages[0]);
        setStep('back');
        await captureSide('back');
      } else {
        setBackUri(scannedImages[0]);
        setStep('review');
      }
    } catch (error) {
      Alert.alert('Scan failed', 'Could not capture that side. Please try again.');
      setStep('select');
    }
  }

  async function captureSingle() {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) {
        return;
      }

      setSaving(true);
      const doc = await createDocument(
        `${activeMode.docPrefix}_${scanTimestampName()}`,
        route.params?.folderId ?? null,
      );
      const finalPath = await persistPageImage(doc.id, scannedImages[0]);
      await addPageRecord(doc.id, finalPath);
      navigation.replace('DocumentDetail', { docId: doc.id });
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the scan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveComposite() {
    if (!frontUri || !backUri) return;
    try {
      setSaving(true);
      const composedUri = await captureRef(compositeRef, { format: 'jpg', quality: 0.92 });
      const doc = await createDocument(
        `${activeMode.docPrefix}_${scanTimestampName()}`,
        route.params?.folderId ?? null,
      );
      const finalPath = await persistPageImage(doc.id, composedUri);
      await addPageRecord(doc.id, finalPath);
      navigation.replace('DocumentDetail', { docId: doc.id });
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the ID card scan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>ID Card</Text>
        <View style={{ width: 24 }} />
      </View>

      {step === 'select' && (
        <>
          <ScrollView contentContainerStyle={styles.selectBody}>
            <View style={styles.exampleCard}>
              <IdCardIllustration mode={subMode} />
              <Text style={styles.exampleTitle}>{activeMode.label}</Text>
              <Text style={styles.exampleDescription}>{activeMode.description}</Text>
            </View>
            <Text style={styles.hint}>
              A must-have feature! Make a ready-to-print e-copy in under a minute. Content is
              stored on your device only — nothing is uploaded.
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.primaryButton} disabled={saving} onPress={handleMakeItNow}>
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Make it now</Text>
            )}
          </TouchableOpacity>

          <View style={[styles.subModeRow, { paddingBottom: 16 + insets.bottom }]}>
            {SUB_MODES.map(mode => (
              <TouchableOpacity
                key={mode.key}
                style={[styles.subModeChip, subMode === mode.key && styles.subModeChipActive]}
                onPress={() => setSubMode(mode.key)}>
                <Icon name={mode.icon} size={22} color={subMode === mode.key ? colors.accent : colors.white} />
                <Text style={[styles.subModeLabel, subMode === mode.key && styles.subModeLabelActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {(step === 'front' || step === 'back') && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.white} size="large" />
          <Text style={styles.statusText}>
            {step === 'front' ? 'Capturing front side…' : 'Now capture the back side…'}
          </Text>
        </View>
      )}

      {step === 'review' && frontUri && backUri && (
        <>
          <View style={styles.previewScroll}>
            <View style={styles.composite} ref={compositeRef} collapsable={false}>
              <Image source={{ uri: `file://${frontUri.replace('file://', '')}` }} style={styles.cardImage} resizeMode="contain" />
              <Image source={{ uri: `file://${backUri.replace('file://', '')}` }} style={styles.cardImage} resizeMode="contain" />
            </View>
          </View>

          <View style={[styles.actionBar, { paddingBottom: 14 + insets.bottom }]}>
            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={saving}
              onPress={() => {
                setBackUri(null);
                setStep('back');
                captureSide('back');
              }}>
              <Icon name="replay" size={18} color={colors.white} />
              <Text style={styles.secondaryButtonText}>Retake Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButtonInline} disabled={saving} onPress={handleSaveComposite}>
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Make it now</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
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
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    marginTop: 12,
    color: colors.white,
    fontSize: 14,
  },
  selectBody: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  exampleTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  exampleDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#9AA0A6',
    textAlign: 'center',
  },
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: '#8A8A8A',
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryButton: {
    marginHorizontal: 16,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryButtonInline: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  subModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  subModeChip: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  subModeChipActive: {
    borderColor: colors.accent,
    backgroundColor: '#132A33',
  },
  subModeLabel: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  subModeLabelActive: {
    color: colors.accent,
  },
  previewScroll: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  composite: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.586,
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  actionBar: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#262626',
  },
  secondaryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
});
