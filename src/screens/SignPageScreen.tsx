import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  PanResponder,
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
import {setPageFilePath} from '../db/database';
import {deletePageFile, persistPageImage} from '../services/fileStorage';
import SignaturePad from '../components/SignaturePad';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SignPage'>;

const SIG_MIN = 60;
const SIG_MAX = 220;
const SIG_DEFAULT = 130;

export default function SignPageScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const {docId, pageId, filePath} = route.params;

  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [sigWidth, setSigWidth] = useState(SIG_DEFAULT);
  const [pos, setPos] = useState({x: 0, y: 0});
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const compositeRef = useRef<View>(null);
  const startPos = useRef({x: 0, y: 0});

  // `panResponder` below is created exactly once via useRef, so its
  // callbacks close over whatever `pos`/`sigWidth` was on that first render
  // forever — reading state directly inside them goes stale. These refs are
  // kept in sync on every update instead, so the drag/pinch handlers always
  // start from the signature's real current position/size rather than
  // snapping back on every gesture.
  const posRef = useRef({x: 0, y: 0});
  const sigWidthRef = useRef(SIG_DEFAULT);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartWidth = useRef(SIG_DEFAULT);

  function updatePos(next: {x: number; y: number}) {
    posRef.current = next;
    setPos(next);
  }

  function updateSigWidth(next: number) {
    const clamped = Math.max(SIG_MIN, Math.min(SIG_MAX, next));
    sigWidthRef.current = clamped;
    setSigWidth(clamped);
  }

  function touchDistance(touches: {pageX: number; pageY: number}[]) {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  }

  // Single finger drags the signature; a second finger switches to
  // pinch-to-resize (mirrors the touch-distance approach in
  // ZoomableImage.tsx, used app-wide instead of a gesture library).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const touches = evt.nativeEvent.touches;
        pinchStartDistance.current =
          touches.length === 2 ? touchDistance(touches) : null;
        pinchStartWidth.current = sigWidthRef.current;
        startPos.current = posRef.current;
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (pinchStartDistance.current === null) {
            pinchStartDistance.current = touchDistance(touches);
            pinchStartWidth.current = sigWidthRef.current;
            return;
          }
          const dist = touchDistance(touches);
          updateSigWidth(
            pinchStartWidth.current * (dist / pinchStartDistance.current),
          );
        } else if (touches.length === 1) {
          pinchStartDistance.current = null;
          updatePos({
            x: startPos.current.x + gesture.dx,
            y: startPos.current.y + gesture.dy,
          });
        }
      },
      onPanResponderRelease: () => {
        pinchStartDistance.current = null;
      },
    }),
  ).current;

  function handleSignatureDone(uri: string) {
    setSignatureUri(uri);
  }

  function handleLayout(width: number, height: number) {
    const sigHeight = SIG_DEFAULT * 0.45;
    updatePos({x: width - SIG_DEFAULT - 16, y: height - sigHeight - 16});
  }

  function resize(delta: number) {
    updateSigWidth(sigWidthRef.current + delta);
  }

  async function handleApply() {
    try {
      setSaving(true);
      // Hide the dashed positioning guide before capture so it isn't baked
      // into the saved page image — wait a frame for the border to actually
      // disappear from the native view before screenshotting it.
      setShowGuide(false);
      await new Promise(resolve => setTimeout(resolve, 80));
      const composedUri = await captureRef(compositeRef, {
        format: 'jpg',
        quality: 0.92,
      });
      const finalPath = await persistPageImage(docId, composedUri);
      const oldPath = filePath;
      await setPageFilePath(pageId, finalPath);
      await deletePageFile(oldPath);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', 'Could not apply the signature to this page.');
      setShowGuide(true);
    } finally {
      setSaving(false);
    }
  }

  if (!signatureUri) {
    return (
      <SignaturePad
        onDone={handleSignatureDone}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  const sigHeight = sigWidth * 0.45;

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={() => setSignatureUri(null)} hitSlop={8}>
          <Icon name="replay" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Position Signature</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View
        style={styles.previewWrap}
        onLayout={e =>
          handleLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)
        }>
        <View
          ref={compositeRef}
          collapsable={false}
          style={styles.compositeArea}>
          <Image
            source={{uri: `file://${filePath}`}}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
          <View
            style={[
              styles.signatureOverlay,
              showGuide && styles.signatureOverlayGuide,
              {left: pos.x, top: pos.y, width: sigWidth, height: sigHeight},
            ]}
            {...panResponder.panHandlers}>
            <Image
              source={{uri: signatureUri}}
              style={styles.signatureImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.sizeBtn} onPress={() => resize(-20)}>
          <Icon name="remove" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.controlsHint}>
          Drag to move · pinch or use buttons to resize
        </Text>
        <TouchableOpacity style={styles.sizeBtn} onPress={() => resize(20)}>
          <Icon name="add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.applyButton}
        onPress={handleApply}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name="check" size={18} color={colors.white} />
            <Text style={styles.applyButtonText}>Apply Signature</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.black,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingBottom: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    previewWrap: {
      flex: 1,
      margin: 16,
    },
    compositeArea: {
      flex: 1,
    },
    signatureOverlay: {
      position: 'absolute',
    },
    signatureOverlayGuide: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderStyle: 'dashed',
    },
    signatureImage: {
      width: '100%',
      height: '100%',
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingBottom: 14,
    },
    sizeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#262626',
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlsHint: {
      fontSize: 12,
      color: '#9AA0A6',
    },
    applyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    applyButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
  });
