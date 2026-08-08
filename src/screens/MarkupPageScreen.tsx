import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Ellipse, Path, Rect} from 'react-native-svg';
import Alert from '../utils/customAlert';
import {captureRef} from 'react-native-view-shot';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {setPageFilePath} from '../db/database';
import {deletePageFile, persistPageImage} from '../services/fileStorage';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MarkupPage'>;

interface StrokePath {
  type: 'path';
  d: string;
  color: string;
}

interface StrokeRect {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface StrokeCircle {
  type: 'circle';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
}

type Shape = StrokePath | StrokeRect | StrokeCircle;
type Tool = 'pen' | 'rectangle' | 'circle';

const SCREEN = Dimensions.get('window');
const COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#111111'];
const STROKE_WIDTH = 4;
const MIN_SHAPE_SIZE = 3;

const TOOLS: {key: Tool; icon: string; label: string}[] = [
  {key: 'pen', icon: 'gesture', label: 'Pen'},
  {key: 'rectangle', icon: 'crop-square', label: 'Rectangle'},
  {key: 'circle', icon: 'panorama-fish-eye', label: 'Circle'},
];

export default function MarkupPageScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {docId, pageId, filePath} = route.params;

  const [display, setDisplay] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [currentShape, setCurrentShape] = useState<
    StrokeRect | StrokeCircle | null
  >(null);
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [saving, setSaving] = useState(false);
  const compositeRef = useRef<View>(null);

  // `panResponder` below is created exactly once via useRef, so reading
  // `activeColor`/`activeTool` directly inside its callbacks would close
  // over whatever was active on the very first render forever — every
  // finished stroke would get committed with that first color/tool
  // regardless of what was actually selected while drawing. These refs are
  // kept in sync on every change instead, so the gesture callbacks always
  // read what was really active for that stroke.
  const activeColorRef = useRef(activeColor);
  const activeToolRef = useRef(activeTool);
  const startPointRef = useRef<{x: number; y: number} | null>(null);

  function selectColor(color: string) {
    activeColorRef.current = color;
    setActiveColor(color);
  }

  function selectTool(tool: Tool) {
    activeToolRef.current = tool;
    setActiveTool(tool);
  }

  React.useEffect(() => {
    Image.getSize(
      `file://${filePath}`,
      (width, height) => {
        const maxW = SCREEN.width - 32;
        const maxH = SCREEN.height - 260;
        const scale = Math.min(maxW / width, maxH / height);
        setDisplay({width: width * scale, height: height * scale});
      },
      () => {
        Alert.alert('Could not open image', 'This page could not be loaded.');
        navigation.goBack();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        const tool = activeToolRef.current;
        if (tool === 'pen') {
          setCurrentPath(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
          return;
        }
        startPointRef.current = {x: locationX, y: locationY};
        setCurrentShape(
          tool === 'rectangle'
            ? {
                type: 'rect',
                x: locationX,
                y: locationY,
                width: 0,
                height: 0,
                color: activeColorRef.current,
              }
            : {
                type: 'circle',
                cx: locationX,
                cy: locationY,
                rx: 0,
                ry: 0,
                color: activeColorRef.current,
              },
        );
      },
      onPanResponderMove: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        const tool = activeToolRef.current;
        if (tool === 'pen') {
          setCurrentPath(
            prev => `${prev} L${locationX.toFixed(1)},${locationY.toFixed(1)}`,
          );
          return;
        }
        const start = startPointRef.current;
        if (!start) {
          return;
        }
        if (tool === 'rectangle') {
          setCurrentShape({
            type: 'rect',
            x: Math.min(start.x, locationX),
            y: Math.min(start.y, locationY),
            width: Math.abs(locationX - start.x),
            height: Math.abs(locationY - start.y),
            color: activeColorRef.current,
          });
        } else {
          setCurrentShape({
            type: 'circle',
            cx: (start.x + locationX) / 2,
            cy: (start.y + locationY) / 2,
            rx: Math.abs(locationX - start.x) / 2,
            ry: Math.abs(locationY - start.y) / 2,
            color: activeColorRef.current,
          });
        }
      },
      onPanResponderRelease: () => {
        if (activeToolRef.current === 'pen') {
          setCurrentPath(prev => {
            if (prev) {
              setShapes(s => [
                ...s,
                {type: 'path', d: prev, color: activeColorRef.current},
              ]);
            }
            return '';
          });
          return;
        }
        startPointRef.current = null;
        setCurrentShape(prev => {
          const bigEnough =
            prev &&
            (prev.type === 'rect'
              ? prev.width > MIN_SHAPE_SIZE && prev.height > MIN_SHAPE_SIZE
              : prev.rx > MIN_SHAPE_SIZE && prev.ry > MIN_SHAPE_SIZE);
          if (prev && bigEnough) {
            setShapes(s => [...s, prev]);
          }
          return null;
        });
      },
    }),
  ).current;

  function handleUndo() {
    setShapes(prev => prev.slice(0, -1));
  }

  function handleClear() {
    setShapes([]);
  }

  async function handleApply() {
    if (shapes.length === 0) {
      navigation.goBack();
      return;
    }
    try {
      setSaving(true);
      const composedUri = await captureRef(compositeRef, {
        format: 'jpg',
        quality: 0.92,
      });
      const newPath = await persistPageImage(docId, composedUri);
      await deletePageFile(filePath);
      await setPageFilePath(pageId, newPath);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', 'Could not save the markup on this page.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Markup</Text>
        <TouchableOpacity
          onPress={handleUndo}
          hitSlop={8}
          disabled={shapes.length === 0}>
          <Icon
            name="undo"
            size={22}
            color={shapes.length === 0 ? colors.textMuted : colors.white}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.stage}>
        {!display ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <View
            ref={compositeRef}
            collapsable={false}
            style={{width: display.width, height: display.height}}>
            <Image
              source={{uri: `file://${filePath}`}}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
            <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
              <Svg style={StyleSheet.absoluteFill}>
                {shapes.map((s, i) => {
                  if (s.type === 'path') {
                    return (
                      <Path
                        key={i}
                        d={s.d}
                        stroke={s.color}
                        strokeWidth={STROKE_WIDTH}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  }
                  if (s.type === 'rect') {
                    return (
                      <Rect
                        key={i}
                        x={s.x}
                        y={s.y}
                        width={s.width}
                        height={s.height}
                        stroke={s.color}
                        strokeWidth={STROKE_WIDTH}
                        fill="none"
                      />
                    );
                  }
                  return (
                    <Ellipse
                      key={i}
                      cx={s.cx}
                      cy={s.cy}
                      rx={s.rx}
                      ry={s.ry}
                      stroke={s.color}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                    />
                  );
                })}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={activeColor}
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {currentShape?.type === 'rect' ? (
                  <Rect
                    x={currentShape.x}
                    y={currentShape.y}
                    width={currentShape.width}
                    height={currentShape.height}
                    stroke={activeColor}
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                  />
                ) : null}
                {currentShape?.type === 'circle' ? (
                  <Ellipse
                    cx={currentShape.cx}
                    cy={currentShape.cy}
                    rx={currentShape.rx}
                    ry={currentShape.ry}
                    stroke={activeColor}
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                  />
                ) : null}
              </Svg>
            </View>
          </View>
        )}
      </View>

      <View style={styles.toolRow}>
        {TOOLS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.toolBtn,
              activeTool === t.key && styles.toolBtnActive,
            ]}
            onPress={() => selectTool(t.key)}>
            <Icon
              name={t.icon}
              size={20}
              color={activeTool === t.key ? colors.accent : colors.white}
            />
            <Text
              style={[
                styles.toolBtnText,
                activeTool === t.key && styles.toolBtnTextActive,
              ]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.colorRow}>
        {COLORS.map(c => (
          <TouchableOpacity
            key={c}
            style={[
              styles.swatch,
              {backgroundColor: c},
              activeColor === c && styles.swatchActive,
            ]}
            onPress={() => selectColor(c)}
          />
        ))}
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={handleClear}
          disabled={shapes.length === 0}>
          <Text
            style={[
              styles.clearBtnText,
              shapes.length === 0 && styles.clearBtnTextDisabled,
            ]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.applyButton}
        onPress={handleApply}
        disabled={saving || !display}>
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name="check" size={18} color={colors.white} />
            <Text style={styles.applyButtonText}>Apply Markup</Text>
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
      paddingTop: 50,
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
    toolRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      paddingBottom: 14,
    },
    toolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    toolBtnActive: {
      borderColor: colors.accent,
      backgroundColor: 'rgba(29,185,144,0.15)',
    },
    toolBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.white,
    },
    toolBtnTextActive: {
      color: colors.accent,
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingBottom: 16,
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchActive: {
      borderColor: colors.white,
    },
    clearBtn: {
      marginLeft: 10,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    clearBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.danger,
    },
    clearBtnTextDisabled: {
      color: colors.textMuted,
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
