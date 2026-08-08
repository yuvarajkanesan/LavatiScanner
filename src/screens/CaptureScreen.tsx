import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {CaptureMode, RootStackParamList} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {pickGalleryImages, pickImportFiles} from '../services/filePicker';
import {ID_CARD_SUB_MODES, IdCardSubMode} from '../constants/idCardModes';
import Icon from '../components/Icon';
import IdCardIllustration from '../components/IdCardIllustration';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;
type Flash = 'off' | 'on' | 'auto';
type CameraPosition = 'back' | 'front';

/** Framing guide aspect ratio (width/height) shown per mode, to help line up
 * the shot before capturing — modes not listed get no guide overlay. */
const FRAME_GUIDE: Partial<Record<CaptureMode, number>> = {
  idcard: 1.586, // standard ID/credit-card ratio
  qrcode: 1, // square target
};
const EXPOSURE_STEP = 0.5;

interface ModeOption {
  key: CaptureMode;
  label: string;
}

const MODES: ModeOption[] = [
  {key: 'book', label: 'Book'},
  {key: 'totext', label: 'To Text'},
  {key: 'docs', label: 'Docs'},
  {key: 'idcard', label: 'ID Card'},
  {key: 'qrcode', label: 'QR Code'},
];

const FLASH_ICON: Record<Flash, string> = {
  off: 'flash-off',
  on: 'flash-on',
  auto: 'flash-auto',
};

/** Modes that show a sample/example + "Make it now" overlay on top of the
 * live camera before the shutter becomes usable — Docs and To Text skip
 * straight to shooting, matching the old behavior. */
const MODE_INTRO: Partial<
  Record<CaptureMode, {icon: string; title: string; description: string}>
> = {
  book: {
    icon: 'menu-book',
    title: 'Book',
    description:
      'Capture a two-page spread and split it into separate pages automatically.',
  },
  qrcode: {
    icon: 'qr-code-scanner',
    title: 'QR Code',
    description: 'Photograph a QR code or barcode to read what it contains.',
  },
};

/**
 * Unified live-camera capture screen for all five scan modes. The camera
 * engine (react-native-vision-camera) always just takes a plain photo —
 * there's no live edge-detection here, unlike the native document-scanner
 * plugin this replaced. Each mode routes the captured photo to whatever
 * screen already knows how to process it (Filter for Docs, or the
 * dedicated Book/ID-card/QR/To-Text screens with the photo pre-supplied
 * via `capturedUri` instead of those screens opening their own camera).
 */
function needsIntro(m: CaptureMode, skipIntro: boolean): boolean {
  if (skipIntro) {
    return false;
  }
  return m === 'book' || m === 'qrcode' || m === 'idcard';
}

export default function CaptureScreen({navigation, route}: Props) {
  const insets = useSafeAreaInsets();
  const session = useScanSession();
  const folderId = route.params?.folderId ?? null;
  // Set when this screen was opened specifically to capture the back side of
  // a two-sided ID card (see IdCardScanScreen) — the sub-mode is already
  // decided, so the sample/"Make it now" picker overlay should stay out of
  // the way and go straight to the live camera.
  const backCapture = route.params?.idCardBackCapture ?? null;

  const [mode, setMode] = useState<CaptureMode>(route.params?.mode ?? 'docs');
  const [flash, setFlash] = useState<Flash>('auto');
  const [hd, setHd] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('back');
  const [exposure, setExposure] = useState(0);
  const [exposureVisible, setExposureVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(true);
  const [introVisible, setIntroVisible] = useState(() =>
    needsIntro(route.params?.mode ?? 'docs', !!backCapture),
  );
  const [idCardSubMode, setIdCardSubMode] = useState<IdCardSubMode>(
    backCapture?.subMode ?? 'twoSided',
  );
  const [focusPoint, setFocusPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const cameraRef = useRef<Camera>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const device = useCameraDevice(cameraPosition);
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();

  const minExposure = device?.minExposure ?? -2;
  const maxExposure = device?.maxExposure ?? 2;

  // Reset exposure back to neutral whenever the active camera changes (e.g.
  // flipping front/back) — the previous device's EV range doesn't carry over.
  useEffect(() => {
    setExposure(0);
  }, [cameraPosition]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenActive(true);
      return () => setIsScreenActive(false);
    }, []),
  );

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'docs' && !session.targetDocId && session.pages.length === 0) {
      session.startSession(folderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every time the active mode changes, re-show the sample/"Make it now"
  // overlay for modes that need one — dismissing it only applies to the
  // current visit to that mode.
  useEffect(() => {
    setIntroVisible(needsIntro(mode, !!backCapture));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function cycleFlash() {
    setFlash(prev =>
      prev === 'off' ? 'auto' : prev === 'auto' ? 'on' : 'off',
    );
  }

  function flipCamera() {
    setCameraPosition(prev => (prev === 'back' ? 'front' : 'back'));
  }

  function adjustExposure(delta: number) {
    setExposure(prev =>
      Math.min(maxExposure, Math.max(minExposure, prev + delta)),
    );
  }

  async function handleFocusTap(evt: GestureResponderEvent) {
    if (!cameraRef.current || !device) {
      return;
    }
    const {locationX, locationY} = evt.nativeEvent;
    setFocusPoint({x: locationX, y: locationY});
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    focusTimeoutRef.current = setTimeout(() => setFocusPoint(null), 700);
    try {
      await cameraRef.current.focus({x: locationX, y: locationY});
    } catch (error) {
      // Some devices/lenses don't support tap-to-focus — ignore.
    }
  }

  async function routeCapturedPhoto(path: string) {
    switch (mode) {
      case 'docs':
        navigation.replace('Trim', {rawUri: path});
        break;
      case 'book':
        navigation.replace('BookScan', {folderId, capturedUri: path});
        break;
      case 'idcard':
        if (backCapture) {
          navigation.replace('IdCardScan', {
            folderId,
            capturedUri: backCapture.frontUri,
            subMode: backCapture.subMode,
            backCapturedUri: path,
          });
        } else {
          navigation.replace('IdCardScan', {
            folderId,
            capturedUri: path,
            subMode: idCardSubMode,
          });
        }
        break;
      case 'qrcode':
        navigation.replace('QrScan', {capturedUri: path});
        break;
      case 'totext':
        navigation.replace('QuickText', {capturedUri: path});
        break;
    }
  }

  async function handleCapture() {
    if (!cameraRef.current || capturing) {
      return;
    }
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePhoto({
        flash,
        enableShutterSound: false,
      });
      await routeCapturedPhoto(photo.path);
    } catch (error) {
      setCapturing(false);
    }
  }

  async function handleImport() {
    const images = await pickGalleryImages();
    if (images.length === 0) {
      return;
    }
    await routeCapturedPhoto(images[0].uri.replace('file://', ''));
  }

  async function handleImportFiles() {
    const {images} = await pickImportFiles();
    if (images.length === 0) {
      return;
    }
    await routeCapturedPhoto(images[0].uri.replace('file://', ''));
  }

  const activeModeLabel = useMemo(
    () => MODES.find(m => m.key === mode)?.label ?? '',
    [mode],
  );

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Icon name="photo-camera" size={48} color={colors.white} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          Lavati Scanner needs camera access to scan documents.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.permissionCancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isScreenActive}
            photo={true}
            photoQualityBalance={hd ? 'quality' : 'speed'}
            torch={flash === 'on' && cameraPosition === 'back' ? 'on' : 'off'}
            enableZoomGesture
            exposure={exposure}
          />
        ) : (
          <View style={styles.deviceLoading}>
            <ActivityIndicator color={colors.white} size="large" />
          </View>
        )}

        {showGrid && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.gridLineV, {left: '33.33%'}]} />
            <View style={[styles.gridLineV, {left: '66.66%'}]} />
            <View style={[styles.gridLineH, {top: '33.33%'}]} />
            <View style={[styles.gridLineH, {top: '66.66%'}]} />
          </View>
        )}

        {!introVisible && FRAME_GUIDE[mode] !== undefined && (
          <View style={styles.frameGuideWrap} pointerEvents="none">
            <View
              style={[styles.frameGuide, {aspectRatio: FRAME_GUIDE[mode]}]}
            />
          </View>
        )}

        {device && !introVisible && (
          <Pressable style={StyleSheet.absoluteFill} onPress={handleFocusTap} />
        )}

        {focusPoint && (
          <View
            pointerEvents="none"
            style={[
              styles.focusRing,
              {left: focusPoint.x - 32, top: focusPoint.y - 32},
            ]}
          />
        )}

        <View style={[styles.topBar, {paddingTop: insets.top + 10}]}>
          <TouchableOpacity onPress={cycleFlash} hitSlop={8}>
            <Icon name={FLASH_ICON[flash]} size={24} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hdBadge, hd && styles.hdBadgeActive]}
            onPress={() => setHd(v => !v)}>
            <Text style={[styles.hdBadgeText, hd && styles.hdBadgeTextActive]}>
              HD
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowGrid(v => !v)} hitSlop={8}>
            <Icon
              name="grid-on"
              size={22}
              color={showGrid ? colors.accent : colors.white}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setExposureVisible(v => !v)}
            hitSlop={8}>
            <Icon
              name="exposure"
              size={22}
              color={exposureVisible ? colors.accent : colors.white}
            />
          </TouchableOpacity>
          {frontDevice && backDevice && (
            <TouchableOpacity onPress={flipCamera} hitSlop={8}>
              <Icon name="cameraswitch" size={22} color={colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('MainTabs', {screen: 'Settings'})
            }
            hitSlop={8}>
            <Icon name="settings" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        {exposureVisible && (
          <View style={[styles.exposureRow, {top: insets.top + 58}]}>
            <TouchableOpacity
              onPress={() => adjustExposure(-EXPOSURE_STEP)}
              disabled={exposure <= minExposure}
              hitSlop={8}>
              <Icon
                name="remove-circle"
                size={26}
                color={exposure <= minExposure ? '#5A5A5A' : colors.white}
              />
            </TouchableOpacity>
            <Text style={styles.exposureValue}>
              {exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)}
            </Text>
            <TouchableOpacity
              onPress={() => adjustExposure(EXPOSURE_STEP)}
              disabled={exposure >= maxExposure}
              hitSlop={8}>
              <Icon
                name="add-circle"
                size={26}
                color={exposure >= maxExposure ? '#5A5A5A' : colors.white}
              />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.modeLabelWrap} pointerEvents="none">
          <Text style={styles.modeLabel}>
            {backCapture ? 'ID Card · Back Side' : activeModeLabel}
          </Text>
        </View>
      </View>

      {!backCapture && (
        <View style={[styles.modeBar, {paddingBottom: 6}]}>
          {MODES.map(m => {
            const active = m.key === mode;
            return (
              <TouchableOpacity
                key={m.key}
                style={styles.modeTab}
                onPress={() => setMode(m.key)}>
                <Text
                  style={[
                    styles.modeTabText,
                    active && styles.modeTabTextActive,
                  ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={[styles.bottomBar, {paddingBottom: 16 + insets.bottom}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={26} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shutter}
          onPress={handleCapture}
          disabled={capturing || !device}
          hitSlop={8}>
          {capturing ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>

        <View style={styles.bottomRightActions}>
          <TouchableOpacity
            style={styles.bottomActionBtn}
            onPress={handleImport}>
            <Icon name="image" size={22} color={colors.white} />
            <Text style={styles.bottomActionText}>Import</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomActionBtn}
            onPress={handleImportFiles}>
            <Icon name="upload-file" size={22} color={colors.white} />
            <Text style={styles.bottomActionText}>Import Files</Text>
          </TouchableOpacity>
        </View>
      </View>

      {introVisible && mode === 'idcard' && (
        <View style={styles.introOverlay}>
          <View style={[styles.introHeader, {paddingTop: insets.top + 10}]}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
              <Icon name="close" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.introBody}>
            <View style={styles.introCard}>
              <IdCardIllustration mode={idCardSubMode} />
              <Text style={styles.introTitle}>
                {ID_CARD_SUB_MODES.find(m => m.key === idCardSubMode)?.label}
              </Text>
              <Text style={styles.introDescription}>
                {
                  ID_CARD_SUB_MODES.find(m => m.key === idCardSubMode)
                    ?.description
                }
              </Text>
            </View>

            <View style={styles.introSubModeRow}>
              {ID_CARD_SUB_MODES.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    styles.introSubModeChip,
                    idCardSubMode === m.key && styles.introSubModeChipActive,
                  ]}
                  onPress={() => setIdCardSubMode(m.key)}>
                  <Icon
                    name={m.icon}
                    size={20}
                    color={
                      idCardSubMode === m.key ? colors.accent : colors.white
                    }
                  />
                  <Text
                    style={[
                      styles.introSubModeLabel,
                      idCardSubMode === m.key && styles.introSubModeLabelActive,
                    ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.introButton}
              onPress={() => setIntroVisible(false)}>
              <Text style={styles.introButtonText}>Make it now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {introVisible && MODE_INTRO[mode] && (
        <View style={styles.introOverlay}>
          <View style={[styles.introHeader, {paddingTop: insets.top + 10}]}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
              <Icon name="close" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.introBody}>
            <View style={styles.introCard}>
              <Icon
                name={MODE_INTRO[mode]!.icon}
                size={40}
                color={colors.accent}
              />
              <Text style={styles.introTitle}>{MODE_INTRO[mode]!.title}</Text>
              <Text style={styles.introDescription}>
                {MODE_INTRO[mode]!.description}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.introButton}
              onPress={() => setIntroVisible(false)}>
              <Text style={styles.introButtonText}>Make it now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  preview: {
    flex: 1,
    backgroundColor: colors.black,
  },
  deviceLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  frameGuideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  frameGuide: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderStyle: 'dashed',
  },
  exposureRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  exposureValue: {
    minWidth: 40,
    textAlign: 'center',
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hdBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.white,
  },
  hdBadgeActive: {
    backgroundColor: colors.white,
  },
  hdBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  hdBadgeTextActive: {
    color: colors.black,
  },
  modeLabelWrap: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 14,
    backgroundColor: colors.black,
  },
  modeTab: {
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A8A',
  },
  modeTabTextActive: {
    color: colors.accent,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: colors.black,
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
  },
  bottomRightActions: {
    flexDirection: 'row',
    gap: 18,
  },
  bottomActionBtn: {
    alignItems: 'center',
    gap: 4,
    width: 60,
  },
  bottomActionText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  permissionTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  permissionText: {
    color: '#9AA0A6',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: 16,
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  permissionCancel: {
    marginTop: 14,
    color: '#9AA0A6',
    fontSize: 14,
    fontWeight: '600',
  },
  focusRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  introOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
  },
  introHeader: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  introBody: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  introTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  introDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#9AA0A6',
    textAlign: 'center',
  },
  introSubModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 20,
  },
  introSubModeChip: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  introSubModeChipActive: {
    borderColor: colors.accent,
    backgroundColor: '#132A33',
  },
  introSubModeLabel: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  introSubModeLabelActive: {
    color: colors.accent,
  },
  introButton: {
    marginTop: 8,
    height: 50,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  introButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
