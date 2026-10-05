import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import Alert from '../utils/customAlert';
import {captureRef} from 'react-native-view-shot';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {createDocument, addPage as addPageRecord} from '../db/database';
import {persistPageImage} from '../services/fileStorage';
import {bakeFilterToFile} from '../services/nativeImageFilter';
import {FILTER_OPTIONS} from '../services/filters';
import {FilterType} from '../types/models';
import {scanTimestampName} from '../utils/format';
import {generateId} from '../utils/ids';
import Icon from '../components/Icon';
import FilteredImage from '../components/FilteredImage';
import ImageCropEditor from '../components/ImageCropEditor';
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
  // Two-sided needs both shots before review; single/passport only ever
  // captures the front, so it reaches review as soon as that one exists.
  const hasAllShots = subMode === 'twoSided' ? !!(frontUri && backUri) : !!frontUri;
  const step: Step = hasAllShots ? 'review' : 'select';
  const [saving, setSaving] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('magicColor');
  const [cropTarget, setCropTarget] = useState<'front' | 'back' | null>(null);
  const compositeRef = useRef<React.ComponentRef<typeof View>>(null);

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

  // Neither side is a saved page yet at this point (nothing's written to the
  // DB until "Make it now"), so cropping here just swaps which raw URI this
  // screen's own route params point to - via `setParams`, the same way
  // React Navigation always updates an already-mounted screen's params -
  // rather than the DB-backed persist/replace `CropPageScreen` does for an
  // already-saved page.
  async function handleCropApply(croppedUri: string) {
    if (cropTarget === 'front') {
      navigation.setParams({capturedUri: croppedUri});
    } else if (cropTarget === 'back') {
      navigation.setParams({backCapturedUri: croppedUri});
    }
    setCropTarget(null);
  }

  // The back side goes through the same live camera as the front, landing
  // back here via `backCapturedUri`.
  function goCaptureBack(uri: string) {
    navigation.replace('Scan', {
      folderId: route.params?.folderId ?? null,
      mode: 'idcard',
      idCardBackCapture: {frontUri: uri, subMode},
    });
  }

  // Retakes just the front - the reverse of `goCaptureBack`. `currentBackUri`
  // (null for single/passport, where there is no back) is threaded through
  // so a two-sided retake doesn't lose the already-captured back.
  function goCaptureFront(currentBackUri: string | null) {
    navigation.replace('Scan', {
      folderId: route.params?.folderId ?? null,
      mode: 'idcard',
      idCardFrontRecapture: {subMode, backUri: currentBackUri},
    });
  }

  function handleMakeItNow() {
    if (!frontUri) {
      return;
    }
    if (subMode === 'twoSided') {
      goCaptureBack(frontUri);
    } else {
      handleSaveSingle();
    }
  }

  async function handleSaveSingle() {
    if (!frontUri) {
      return;
    }
    try {
      setSaving(true);
      const doc = await createDocument(
        `${activeMode.docPrefix}_${scanTimestampName()}`,
        route.params?.folderId ?? null,
      );
      const bakedUri =
        selectedFilter === 'original'
          ? frontUri
          : await bakeFilterToFile(
              frontUri,
              selectedFilter,
              `${RNFS.CachesDirectoryPath}/idcard_${generateId()}.jpg`,
            );
      const finalPath = await persistPageImage(doc.id, bakedUri);
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
              minute. Stays on your device unless you turn on Google Drive
              backup in Settings.
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

      {step === 'review' && frontUri && (
        <>
          <View style={styles.previewScroll}>
            {subMode === 'twoSided' && backUri ? (
              <View
                style={styles.composite}
                ref={compositeRef}
                collapsable={false}>
                <View style={styles.cardImageWrap}>
                  <FilteredImage
                    uri={frontUri}
                    filter={selectedFilter}
                    style={styles.cardImage}
                  />
                  <TouchableOpacity
                    style={styles.cropIconBtn}
                    onPress={() => setCropTarget('front')}
                    hitSlop={6}>
                    <Icon name="crop" size={16} color={colors.white} />
                  </TouchableOpacity>
                </View>
                <View style={styles.cardImageWrap}>
                  <FilteredImage
                    uri={backUri}
                    filter={selectedFilter}
                    style={styles.cardImage}
                  />
                  <TouchableOpacity
                    style={styles.cropIconBtn}
                    onPress={() => setCropTarget('back')}
                    hitSlop={6}>
                    <Icon name="crop" size={16} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.singleComposite}>
                <View style={styles.cardImageWrap}>
                  <FilteredImage
                    uri={frontUri}
                    filter={selectedFilter}
                    style={styles.cardImage}
                  />
                  <TouchableOpacity
                    style={styles.cropIconBtn}
                    onPress={() => setCropTarget('front')}
                    hitSlop={6}>
                    <Icon name="crop" size={16} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}>
            {FILTER_OPTIONS.map(option => {
              const active = selectedFilter === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedFilter(option.id)}>
                  <FilteredImage
                    uri={frontUri}
                    filter={option.id}
                    style={styles.filterThumb}
                  />
                  <View
                    style={[
                      styles.filterLabelBar,
                      active && styles.filterLabelBarActive,
                    ]}>
                    <Text style={styles.filterLabel}>{option.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.actionBar, {paddingBottom: 14 + insets.bottom}]}>
            {subMode === 'twoSided' ? (
              <>
                <TouchableOpacity
                  style={styles.secondaryButtonSmall}
                  disabled={saving}
                  onPress={() => goCaptureFront(backUri)}>
                  <Icon name="replay" size={16} color={colors.white} />
                  <Text style={styles.secondaryButtonText}>Front</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButtonSmall}
                  disabled={saving}
                  onPress={() => goCaptureBack(frontUri!)}>
                  <Icon name="replay" size={16} color={colors.white} />
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.secondaryButton}
                disabled={saving}
                onPress={() => goCaptureFront(null)}>
                <Icon name="replay" size={18} color={colors.white} />
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.primaryButtonInline}
              disabled={saving}
              onPress={
                subMode === 'twoSided' ? handleSaveComposite : handleSaveSingle
              }>
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Make it now</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {cropTarget && (
        <Modal visible animationType="slide" onRequestClose={() => setCropTarget(null)}>
          <ImageCropEditor
            filePath={cropTarget === 'front' ? frontUri! : backUri!}
            title={cropTarget === 'front' ? 'Crop Front' : 'Crop Back'}
            onCancel={() => setCropTarget(null)}
            onApply={handleCropApply}
          />
        </Modal>
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
  singleComposite: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.586,
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  cardImageWrap: {
    position: 'relative',
  },
  cropIconBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  filterRow: {
    maxHeight: 108,
    backgroundColor: '#111111',
  },
  filterRowContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  filterChip: {
    width: 70,
    height: 92,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    borderColor: colors.accent,
  },
  filterThumb: {
    width: '100%',
    height: '100%',
  },
  filterLabelBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  filterLabelBarActive: {
    backgroundColor: colors.accent,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
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
  secondaryButtonSmall: {
    width: 90,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#262626',
  },
  secondaryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
});
