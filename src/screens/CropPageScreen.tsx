import React, {useMemo, useRef, useState} from 'react';
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
import Svg, {Line} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Alert from '../utils/customAlert';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {setPageFilePath} from '../db/database';
import {deletePageFile, persistPageImage} from '../services/fileStorage';
import {cropImageFile} from '../services/pdfExport';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CropPage'>;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const MIN_CROP_SIZE = 48;
const INSET_RATIO = 0.08;

export default function CropPageScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const {docId, pageId, filePath} = route.params;
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();

  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [display, setDisplay] = useState<{width: number; height: number}>({
    width: 0,
    height: 0,
  });
  const [rect, setRect] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCorner, setActiveCorner] = useState<Corner | null>(null);
  const [touchPoint, setTouchPoint] = useState<{x: number; y: number} | null>(
    null,
  );
  const rectStart = useRef<Rect | null>(null);

  // The PanResponders below are created exactly once via useRef, so their
  // callbacks close over whatever `rect`/`display` were on that first
  // render (null / zero) forever — reading state directly inside them goes
  // stale and every drag silently no-ops. These refs are kept in sync on
  // every update instead, so the responders always read live values.
  const rectRef = useRef<Rect | null>(null);
  const displayRef = useRef({width: 0, height: 0});

  function updateRect(next: Rect) {
    rectRef.current = next;
    setRect(next);
  }

  function updateDisplay(next: {width: number; height: number}) {
    displayRef.current = next;
    setDisplay(next);
  }

  React.useEffect(() => {
    Image.getSize(
      `file://${filePath}`,
      (width, height) => {
        const maxW = screenWidth - 32;
        const maxH = screenHeight - 280 - insets.top - insets.bottom;
        const scale = Math.min(maxW / width, maxH / height);
        const dw = width * scale;
        const dh = height * scale;
        setImageSize({width, height});
        updateDisplay({width: dw, height: dh});
        updateRect({
          x: dw * INSET_RATIO,
          y: dh * INSET_RATIO,
          width: dw * (1 - 2 * INSET_RATIO),
          height: dh * (1 - 2 * INSET_RATIO),
        });
      },
      () => {
        Alert.alert('Could not open image', 'This page could not be loaded.');
        navigation.goBack();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, screenWidth, screenHeight]);

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function makeCornerResponder(corner: Corner) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rectStart.current = rectRef.current;
        setActiveCorner(corner);
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = rectStart.current;
        if (!start) {
          return;
        }
        const {width: displayWidth, height: displayHeight} = displayRef.current;
        let {x, y, width, height} = start;
        if (corner === 'tl' || corner === 'bl') {
          const newX = clamp(
            start.x + gesture.dx,
            0,
            start.x + start.width - MIN_CROP_SIZE,
          );
          width = start.width - (newX - start.x);
          x = newX;
        } else {
          width = clamp(
            start.width + gesture.dx,
            MIN_CROP_SIZE,
            displayWidth - start.x,
          );
        }
        if (corner === 'tl' || corner === 'tr') {
          const newY = clamp(
            start.y + gesture.dy,
            0,
            start.y + start.height - MIN_CROP_SIZE,
          );
          height = start.height - (newY - start.y);
          y = newY;
        } else {
          height = clamp(
            start.height + gesture.dy,
            MIN_CROP_SIZE,
            displayHeight - start.y,
          );
        }
        updateRect({x, y, width, height});
        setTouchPoint({
          x: corner === 'tl' || corner === 'bl' ? x : x + width,
          y: corner === 'tl' || corner === 'tr' ? y : y + height,
        });
      },
      onPanResponderRelease: () => {
        setActiveCorner(null);
        setTouchPoint(null);
      },
      onPanResponderTerminate: () => {
        setActiveCorner(null);
        setTouchPoint(null);
      },
    });
  }

  const tlResponder = useRef(makeCornerResponder('tl')).current;
  const trResponder = useRef(makeCornerResponder('tr')).current;
  const blResponder = useRef(makeCornerResponder('bl')).current;
  const brResponder = useRef(makeCornerResponder('br')).current;

  const bodyResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rectStart.current = rectRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = rectStart.current;
        if (!start) {
          return;
        }
        const {width: displayWidth, height: displayHeight} = displayRef.current;
        const x = clamp(start.x + gesture.dx, 0, displayWidth - start.width);
        const y = clamp(start.y + gesture.dy, 0, displayHeight - start.height);
        updateRect({x, y, width: start.width, height: start.height});
      },
    }),
  ).current;

  function handleReset() {
    updateRect({
      x: display.width * INSET_RATIO,
      y: display.height * INSET_RATIO,
      width: display.width * (1 - 2 * INSET_RATIO),
      height: display.height * (1 - 2 * INSET_RATIO),
    });
  }

  async function handleApply() {
    if (!rect || !imageSize || display.width === 0 || display.height === 0) {
      return;
    }
    try {
      setSaving(true);
      const xRatio = rect.x / display.width;
      const yRatio = rect.y / display.height;
      const widthRatio = rect.width / display.width;
      const heightRatio = rect.height / display.height;
      const croppedUri = await cropImageFile(
        filePath,
        xRatio,
        yRatio,
        widthRatio,
        heightRatio,
        `crop_${pageId}`,
      );
      const newPath = await persistPageImage(docId, croppedUri);
      await deletePageFile(filePath);
      await setPageFilePath(pageId, newPath);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Crop failed', 'Could not crop this page.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 20}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Crop</Text>
        <TouchableOpacity onPress={handleReset} hitSlop={8}>
          <Icon name="restore" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.stage}>
        {!rect ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <View style={{width: display.width, height: display.height}}>
            <Image
              source={{uri: `file://${filePath}`}}
              style={{width: display.width, height: display.height}}
              resizeMode="contain"
            />

            {/* Dim everything outside the crop rect. */}
            <View
              pointerEvents="none"
              style={[styles.veil, {top: 0, left: 0, right: 0, height: rect.y}]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.veil,
                {top: rect.y + rect.height, left: 0, right: 0, bottom: 0},
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.veil,
                {top: rect.y, left: 0, width: rect.x, height: rect.height},
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.veil,
                {
                  top: rect.y,
                  left: rect.x + rect.width,
                  right: 0,
                  height: rect.height,
                },
              ]}
            />

            <View
              style={[
                styles.cropBox,
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  borderColor: colors.accent,
                },
              ]}
              {...bodyResponder.panHandlers}>
              <View style={styles.gridLineV} />
              <View style={[styles.gridLineV, {left: '66.66%'}]} />
              <View style={styles.gridLineH} />
              <View style={[styles.gridLineH, {top: '66.66%'}]} />
            </View>

            <View
              style={[styles.handle, {left: rect.x, top: rect.y}]}
              {...tlResponder.panHandlers}
            />
            <View
              style={[styles.handle, {left: rect.x + rect.width, top: rect.y}]}
              {...trResponder.panHandlers}
            />
            <View
              style={[styles.handle, {left: rect.x, top: rect.y + rect.height}]}
              {...blResponder.panHandlers}
            />
            <View
              style={[
                styles.handle,
                {left: rect.x + rect.width, top: rect.y + rect.height},
              ]}
              {...brResponder.panHandlers}
            />

            {activeCorner && touchPoint && display.width > 0 ? (
              <Loupe
                point={touchPoint}
                neighbors={getRectNeighborPoints(activeCorner, rect)}
                displayWidth={display.width}
                displayHeight={display.height}
                filePath={filePath}
                accentColor={colors.accent}
              />
            ) : null}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.applyButton, {marginBottom: 20 + insets.bottom}]}
        onPress={handleApply}
        disabled={saving || !rect}>
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name="check" size={18} color={colors.white} />
            <Text style={styles.applyButtonText}>Apply Crop</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const LOUPE_SIZE = 110;
const LOUPE_ZOOM = 2.5;
const LOUPE_MARGIN = 16;
const EDGE_LINE_THICKNESS = 4;

/** The two rect edges meeting at `corner` - used to draw the loupe's corner
 * marker as the *actual* crop boundary (matching the reference screenshot's
 * angled edge lines) instead of a generic centered "+". */
function getRectNeighborPoints(
  corner: Corner,
  rect: Rect,
): [{x: number; y: number}, {x: number; y: number}] {
  const corners: Record<Corner, {x: number; y: number}> = {
    tl: {x: rect.x, y: rect.y},
    tr: {x: rect.x + rect.width, y: rect.y},
    br: {x: rect.x + rect.width, y: rect.y + rect.height},
    bl: {x: rect.x, y: rect.y + rect.height},
  };
  const order: Corner[] = ['tl', 'tr', 'br', 'bl'];
  const i = order.indexOf(corner);
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
  point: {x: number; y: number};
  neighbors: [{x: number; y: number}, {x: number; y: number}];
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
      paddingBottom: 16,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    stage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    veil: {
      position: 'absolute',
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    cropBox: {
      position: 'absolute',
      borderWidth: 3,
    },
    gridLineV: {
      position: 'absolute',
      left: '33.33%',
      top: 0,
      bottom: 0,
      width: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    gridLineH: {
      position: 'absolute',
      top: '33.33%',
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    handle: {
      position: 'absolute',
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      marginLeft: -HANDLE_SIZE / 2,
      marginTop: -HANDLE_SIZE / 2,
      borderRadius: HANDLE_SIZE / 2,
      backgroundColor: colors.white,
      borderWidth: 3,
      borderColor: colors.accent,
    },
    applyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
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
