import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {Line, Polygon} from 'react-native-svg';
import RNFS from 'react-native-fs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Alert from '../utils/customAlert';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useScanSession} from '../context/ScanSessionContext';
import {
  detectDocumentCorners,
  warpPerspective,
} from '../services/nativeImageFilter';
import {generateId} from '../utils/ids';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Trim'>;

interface Point {
  x: number;
  y: number;
}

type CornerKey = 'tl' | 'tr' | 'br' | 'bl';
type Corners = Record<CornerKey, Point>;

const INSET_RATIO = 0.04;

export default function TrimPageScreen({navigation, route}: Props) {
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const {rawUri, pageId: editingPageId} = route.params;
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();

  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [display, setDisplay] = useState({width: 0, height: 0});
  const [corners, setCorners] = useState<Corners | null>(null);
  const [autoCrop, setAutoCrop] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);

  // Refs kept in sync with the state above on every update — the
  // PanResponders below are created once via useRef, so reading state
  // directly inside their callbacks would close over stale values forever
  // (the exact bug that made dragging silently no-op in the crop screen).
  const cornersRef = useRef<Corners | null>(null);
  const displayRef = useRef({width: 0, height: 0});
  const startCorner = useRef<Point | null>(null);
  // Auto-detected page/book corners (display space), and whether the user
  // has since dragged a handle - detection finishing late must never
  // overwrite a manual adjustment.
  const detectedRef = useRef<Corners | null>(null);
  const userEditedRef = useRef(false);

  function updateCorners(next: Corners) {
    cornersRef.current = next;
    setCorners(next);
  }

  function updateDisplay(next: {width: number; height: number}) {
    displayRef.current = next;
    setDisplay(next);
  }

  React.useEffect(() => {
    Image.getSize(
      `file://${rawUri.replace('file://', '')}`,
      (width, height) => {
        const maxW = screenWidth - 32;
        const maxH = screenHeight - 320 - insets.top - insets.bottom;
        const scale = Math.min(maxW / width, maxH / height);
        const dw = width * scale;
        const dh = height * scale;
        setImageSize({width, height});
        updateDisplay({width: dw, height: dh});
        const insetX = dw * INSET_RATIO;
        const insetY = dh * INSET_RATIO;
        updateCorners({
          tl: {x: insetX, y: insetY},
          tr: {x: dw - insetX, y: insetY},
          br: {x: dw - insetX, y: dh - insetY},
          bl: {x: insetX, y: dh - insetY},
        });
        detectedRef.current = null;
        userEditedRef.current = false;
        if (!editingPageId) {
          detectDocumentCorners(rawUri)
            .then(found => {
              if (!found) {
                return;
              }
              const detected: Corners = {
                tl: {x: found.topLeft.x * dw, y: found.topLeft.y * dh},
                tr: {x: found.topRight.x * dw, y: found.topRight.y * dh},
                br: {x: found.bottomRight.x * dw, y: found.bottomRight.y * dh},
                bl: {x: found.bottomLeft.x * dw, y: found.bottomLeft.y * dh},
              };
              detectedRef.current = detected;
              if (!userEditedRef.current) {
                updateCorners(detected);
              }
            })
            .catch(() => {
              // Detection is a best-effort nicety - keep the full-frame crop.
            });
        }
      },
      () => {
        Alert.alert('Could not open image', 'This page could not be loaded.');
        navigation.goBack();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawUri, screenWidth, screenHeight]);

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function makeCornerResponder(key: CornerKey) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startCorner.current = cornersRef.current
          ? cornersRef.current[key]
          : null;
        setActiveCorner(key);
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = startCorner.current;
        const current = cornersRef.current;
        if (!start || !current) {
          return;
        }
        const {width: dw, height: dh} = displayRef.current;
        const x = clamp(start.x + gesture.dx, 0, dw);
        const y = clamp(start.y + gesture.dy, 0, dh);
        updateCorners({...current, [key]: {x, y}});
        userEditedRef.current = true;
        setAutoCrop(false);
      },
      onPanResponderRelease: () => {
        setActiveCorner(null);
      },
      onPanResponderTerminate: () => {
        setActiveCorner(null);
      },
    });
  }

  const tlResponder = useRef(makeCornerResponder('tl')).current;
  const trResponder = useRef(makeCornerResponder('tr')).current;
  const brResponder = useRef(makeCornerResponder('br')).current;
  const blResponder = useRef(makeCornerResponder('bl')).current;

  function handleAutoCropToggle() {
    if (!autoCrop && display.width > 0) {
      // Re-enabling snaps back to the detected page/book edges, or the full
      // frame when nothing document-like was found.
      userEditedRef.current = false;
      if (detectedRef.current) {
        updateCorners(detectedRef.current);
      } else {
        const insetX = display.width * INSET_RATIO;
        const insetY = display.height * INSET_RATIO;
        updateCorners({
          tl: {x: insetX, y: insetY},
          tr: {x: display.width - insetX, y: insetY},
          br: {x: display.width - insetX, y: display.height - insetY},
          bl: {x: insetX, y: display.height - insetY},
        });
      }
    }
    setAutoCrop(v => !v);
  }

  function handleRetake() {
    if (editingPageId) {
      // Re-trimming a page that's already in the session — nothing to
      // reshoot, just back out without changing it.
      navigation.goBack();
      return;
    }
    navigation.replace('Scan', {mode: 'docs', folderId: session.folderId});
  }

  async function handleContinue() {
    if (!corners || !imageSize || display.width === 0) {
      return;
    }
    try {
      setSaving(true);
      const scaleX = imageSize.width / display.width;
      const scaleY = imageSize.height / display.height;
      const toImageSpace = (p: Point) => ({x: p.x * scaleX, y: p.y * scaleY});

      const outputPath = `${RNFS.CachesDirectoryPath}/trim_${generateId()}.jpg`;
      const warpedPath = await warpPerspective(
        rawUri,
        {
          topLeft: toImageSpace(corners.tl),
          topRight: toImageSpace(corners.tr),
          bottomRight: toImageSpace(corners.br),
          bottomLeft: toImageSpace(corners.bl),
        },
        outputPath,
        92,
      );

      if (editingPageId) {
        session.updatePage(editingPageId, {rawUri: `file://${warpedPath}`});
        navigation.replace('Filter', {pageId: editingPageId});
      } else {
        // Freshly captured pages default to "Auto" instead of the
        // untouched photo.
        const pageId = session.addPage(`file://${warpedPath}`, 'magicColor');
        navigation.replace('Filter', {pageId});
      }
    } catch (error) {
      Alert.alert('Trim failed', 'Could not straighten this page.');
    } finally {
      setSaving(false);
    }
  }

  const polygonPoints = corners
    ? `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`
    : '';

  return (
    <View style={styles.container}>
      <View style={[styles.stage, {paddingTop: 60 + insets.top}]}>
        {!corners ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <View style={{width: display.width, height: display.height}}>
            <Image
              source={{uri: `file://${rawUri.replace('file://', '')}`}}
              style={{width: display.width, height: display.height}}
              resizeMode="contain"
            />

            <Svg
              style={StyleSheet.absoluteFill}
              width={display.width}
              height={display.height}>
              <Polygon
                points={polygonPoints}
                fill="rgba(28,160,222,0.2)"
                stroke={colors.accent}
                strokeWidth={3}
              />
            </Svg>

            <Handle point={corners.tl} responder={tlResponder} />
            <Handle point={corners.tr} responder={trResponder} />
            <Handle point={corners.br} responder={brResponder} />
            <Handle point={corners.bl} responder={blResponder} />

            {activeCorner && corners && display.width > 0 ? (
              <Loupe
                point={corners[activeCorner]}
                neighbors={getNeighborPoints(activeCorner, corners)}
                displayWidth={display.width}
                displayHeight={display.height}
                filePath={rawUri.replace('file://', '')}
                accentColor={colors.accent}
              />
            ) : null}
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        Drag the handle in the picture to adjust the trimming range, or use the
        clipping tool later to adjust
      </Text>

      <View style={[styles.footer, {paddingBottom: 28 + insets.bottom}]}>
        <TouchableOpacity
          style={styles.autoCropRow}
          onPress={handleAutoCropToggle}>
          <View
            style={[styles.autoCropDot, autoCrop && styles.autoCropDotActive]}
          />
          <Text style={styles.autoCropText}>Auto Crop</Text>
        </TouchableOpacity>

        <View style={styles.footerButtons}>
          <TouchableOpacity
            onPress={handleRetake}
            disabled={saving}
            hitSlop={8}>
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            disabled={saving || !corners}>
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const LOUPE_SIZE = 110;
const LOUPE_ZOOM = 2.5;
const LOUPE_MARGIN = 16;
const EDGE_LINE_THICKNESS = 4;

/** The two polygon edges meeting at `key` - used to draw the loupe's
 * corner marker as the *actual* crop boundary (matching the reference
 * screenshot's angled edge lines) instead of a generic centered "+",
 * since a trimmed page's corners aren't axis-aligned like a plain rect's. */
function getNeighborPoints(key: CornerKey, corners: Corners): [Point, Point] {
  const order: CornerKey[] = ['tl', 'tr', 'br', 'bl'];
  const i = order.indexOf(key);
  const next = order[(i + 1) % order.length];
  const prev = order[(i + order.length - 1) % order.length];
  return [corners[next], corners[prev]];
}

function Loupe({
  point,
  neighbors,
  displayWidth,
  displayHeight,
  filePath,
  accentColor,
}: {
  point: Point;
  neighbors: [Point, Point];
  displayWidth: number;
  displayHeight: number;
  filePath: string;
  accentColor: string;
}) {
  // Pinned to whichever corner of the stage is diagonally opposite the
  // touch point, rather than a single fixed spot - far enough from the
  // finger to never be covered by the hand that's dragging (the original
  // problem a fixed top-left spot solved), but it now also tracks which
  // edge is actually being adjusted instead of sitting in the same place
  // the whole time.
  const left =
    point.x < displayWidth / 2
      ? displayWidth - LOUPE_SIZE - LOUPE_MARGIN
      : LOUPE_MARGIN;
  const top =
    point.y < displayHeight / 2
      ? displayHeight - LOUPE_SIZE - LOUPE_MARGIN
      : LOUPE_MARGIN;

  const translateX = LOUPE_SIZE / 2 - point.x * LOUPE_ZOOM;
  const translateY = LOUPE_SIZE / 2 - point.y * LOUPE_ZOOM;

  // Each edge is drawn as a ray from the loupe's center toward its
  // neighboring corner (zoomed + extended to clear the circle), so the
  // marker is the real angle of that edge instead of an axis-aligned "+".
  const edgeEndpoints = neighbors.map(neighbor => {
    const dx = neighbor.x - point.x;
    const dy = neighbor.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    const scale = LOUPE_SIZE / length;
    return {
      x: LOUPE_SIZE / 2 + dx * scale,
      y: LOUPE_SIZE / 2 + dy * scale,
    };
  });

  return (
    <View
      pointerEvents="none"
      style={[
        loupeStyles.container,
        {left, top, borderColor: accentColor},
      ]}>
      <Image
        source={{uri: `file://${filePath}`}}
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: displayWidth * LOUPE_ZOOM,
          height: displayHeight * LOUPE_ZOOM,
          transform: [{translateX}, {translateY}],
        }}
      />
      <Svg
        style={StyleSheet.absoluteFill}
        width={LOUPE_SIZE}
        height={LOUPE_SIZE}>
        {edgeEndpoints.map((end, i) => (
          <Line
            key={i}
            x1={LOUPE_SIZE / 2}
            y1={LOUPE_SIZE / 2}
            x2={end.x}
            y2={end.y}
            stroke={accentColor}
            strokeWidth={EDGE_LINE_THICKNESS}
          />
        ))}
      </Svg>
    </View>
  );
}

const loupeStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});

const HANDLE_SIZE = 28;

function Handle({
  point,
  responder,
}: {
  point: Point;
  responder: ReturnType<typeof PanResponder.create>;
}) {
  return (
    <View
      style={[handleStyles.handle, {left: point.x, top: point.y}]}
      {...responder.panHandlers}
    />
  );
}

const handleStyles = StyleSheet.create({
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    marginLeft: -HANDLE_SIZE / 2,
    marginTop: -HANDLE_SIZE / 2,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: colors.accent,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    color: '#CFCFCF',
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 20,
    gap: 18,
  },
  autoCropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoCropDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5A5A5A',
  },
  autoCropDotActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(28,160,222,0.25)',
  },
  autoCropText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 24,
  },
  retakeText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  continueButton: {
    minWidth: 120,
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  continueButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
