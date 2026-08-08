import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import {captureRef} from 'react-native-view-shot';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {createDocument, addPage as addPageRecord} from '../db/database';
import {persistPageImage} from '../services/fileStorage';
import {scanTimestampName} from '../utils/format';
import Icon from '../components/Icon';
import IdCardIllustration from '../components/IdCardIllustration';
import {ID_CARD_SUB_MODES} from '../constants/idCardModes';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'IdCardScan'>;

type Step = 'select' | 'review';

const SUB_MODES = ID_CARD_SUB_MODES;

export default function IdCardScanScreen({navigation, route}: Props) {
  const insets = useSafeAreaInsets();
  const [subMode, setSubMode] = useState(route.params?.subMode ?? 'twoSided');
  // The unified camera screen always captures one shot (the front, or the
  // only shot for single/passport) before landing here — this screen no
  // longer opens a camera of its own. When both sides have already been
  // captured (arriving back from the back-side camera round-trip) skip
  // straight to the review step instead of showing "Make it now" again.
  const frontUri = route.params?.capturedUri ?? null;
  const backUri = route.params?.backCapturedUri ?? null;
  const step: Step = frontUri && backUri ? 'review' : 'select';
  const [saving, setSaving] = useState(false);
  const compositeRef = useRef<View>(null);

  const activeMode = SUB_MODES.find(m => m.key === subMode)!;

  useEffect(() => {
    // Defensive: this screen should only ever be reached with a photo
    // already captured by the unified camera. If it somehow isn't (e.g. a
    // stale deep link), send the user straight into that camera instead of
    // falling back to any old capture UI.
    if (!frontUri) {
      navigation.replace('Scan', {
        folderId: route.params?.folderId ?? null,
        mode: 'idcard',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The back side goes through the same live camera as the front, landing
  // back here via `backCapturedUri`.
  function goCaptureBack(uri: string) {
    navigation.replace('Scan', {
      folderId: route.params?.folderId ?? null,
      mode: 'idcard',
      idCardBackCapture: {frontUri: uri, subMode},
    });
  }

  function handleMakeItNow() {
    if (!frontUri) {
      return;
    }
    if (subMode === 'twoSided') {
      goCaptureBack(frontUri);
    } else {
      captureSingle();
    }
  }

  async function captureSingle() {
    if (!frontUri) {
      return;
    }
    try {
      setSaving(true);
      const doc = await createDocument(
        `${activeMode.docPrefix}_${scanTimestampName()}`,
        route.params?.folderId ?? null,
      );
      const finalPath = await persistPageImage(doc.id, frontUri);
      await addPageRecord(doc.id, finalPath);
      navigation.replace('DocumentDetail', {docId: doc.id});
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the scan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveComposite() {
    if (!frontUri || !backUri) {
      return;
    }
    try {
      setSaving(true);
      const composedUri = await captureRef(compositeRef, {
        format: 'jpg',
        quality: 0.92,
      });
      const doc = await createDocument(
        `${activeMode.docPrefix}_${scanTimestampName()}`,
        route.params?.folderId ?? null,
      );
      const finalPath = await persistPageImage(doc.id, composedUri);
      await addPageRecord(doc.id, finalPath);
      navigation.replace('DocumentDetail', {docId: doc.id});
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the ID card scan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>ID Card</Text>
        <View style={{width: 24}} />
      </View>

      {step === 'select' && (
        <>
          <ScrollView contentContainerStyle={styles.selectBody}>
            <View style={styles.exampleCard}>
              <IdCardIllustration mode={subMode} />
              <Text style={styles.exampleTitle}>{activeMode.label}</Text>
              <Text style={styles.exampleDescription}>
                {activeMode.description}
              </Text>
            </View>
            <Text style={styles.hint}>
              A must-have feature! Make a ready-to-print e-copy in under a
              minute. Content is stored on your device only — nothing is
              uploaded.
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryButton}
            disabled={saving}
            onPress={handleMakeItNow}>
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Make it now</Text>
            )}
          </TouchableOpacity>

          <View
            style={[styles.subModeRow, {paddingBottom: 16 + insets.bottom}]}>
            {SUB_MODES.map(mode => (
              <TouchableOpacity
                key={mode.key}
                style={[
                  styles.subModeChip,
                  subMode === mode.key && styles.subModeChipActive,
                ]}
                onPress={() => setSubMode(mode.key)}>
                <Icon
                  name={mode.icon}
                  size={22}
                  color={subMode === mode.key ? colors.accent : colors.white}
                />
                <Text
                  style={[
                    styles.subModeLabel,
                    subMode === mode.key && styles.subModeLabelActive,
                  ]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {step === 'review' && frontUri && backUri && (
        <>
          <View style={styles.previewScroll}>
            <View
              style={styles.composite}
              ref={compositeRef}
              collapsable={false}>
              <Image
                source={{uri: `file://${frontUri.replace('file://', '')}`}}
                style={styles.cardImage}
                resizeMode="contain"
              />
              <Image
                source={{uri: `file://${backUri.replace('file://', '')}`}}
                style={styles.cardImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={[styles.actionBar, {paddingBottom: 14 + insets.bottom}]}>
            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={saving}
              onPress={() => goCaptureBack(frontUri!)}>
              <Icon name="replay" size={18} color={colors.white} />
              <Text style={styles.secondaryButtonText}>Retake Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButtonInline}
              disabled={saving}
              onPress={handleSaveComposite}>
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
