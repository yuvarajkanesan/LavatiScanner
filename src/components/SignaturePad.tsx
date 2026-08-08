import React, {useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {captureRef} from 'react-native-view-shot';
import Icon from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

interface Props {
  onDone: (signatureUri: string) => void;
  onCancel: () => void;
}

// Fixed ink-blue stroke on a fixed white canvas, independent of the app's
// light/dark theme — a signature is applied onto a white/light scanned
// document page, so it must always render as a classic blue-pen signature
// rather than following theme colors (which turn near-white in dark mode
// and become invisible once placed).
const INK_COLOR = '#1E3A8A';
const CANVAS_COLOR = '#FFFFFF';

/** Draw-your-signature canvas. Pure SVG + PanResponder — no native drawing dependency. */
export default function SignaturePad({onDone, onCancel}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const canvasRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        setCurrentPath(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderMove: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        setCurrentPath(
          prev => `${prev} L${locationX.toFixed(1)},${locationY.toFixed(1)}`,
        );
      },
      onPanResponderRelease: () => {
        setCurrentPath(prev => {
          if (prev) {
            setPaths(p => [...p, prev]);
          }
          return '';
        });
      },
    }),
  ).current;

  function handleClear() {
    setPaths([]);
    setCurrentPath('');
  }

  async function handleDone() {
    if (paths.length === 0) {
      return;
    }
    try {
      setSaving(true);
      const uri = await captureRef(canvasRef, {format: 'png', quality: 1});
      onDone(uri);
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = paths.length === 0 && !currentPath;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Icon name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Draw Your Signature</Text>
        <TouchableOpacity onPress={handleClear} hitSlop={8} disabled={isEmpty}>
          <Text style={[styles.clearText, isEmpty && styles.clearTextDisabled]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.canvasWrap}>
        <View
          ref={canvasRef}
          collapsable={false}
          style={styles.canvas}
          {...panResponder.panHandlers}>
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={INK_COLOR}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath ? (
              <Path
                d={currentPath}
                stroke={INK_COLOR}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>
        </View>
        {isEmpty && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hint}>Sign here</Text>
          </View>
        )}
        <View style={styles.signLine} pointerEvents="none" />
      </View>

      <TouchableOpacity
        style={[styles.doneButton, isEmpty && styles.doneButtonDisabled]}
        onPress={handleDone}
        disabled={isEmpty || saving}>
        <Icon name="check" size={18} color={colors.white} />
        <Text style={styles.doneButtonText}>
          {saving ? 'Saving…' : 'Use This Signature'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    clearText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.danger,
    },
    clearTextDisabled: {
      color: colors.textMuted,
      opacity: 0.5,
    },
    canvasWrap: {
      flex: 1,
      margin: 20,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: CANVAS_COLOR,
      overflow: 'hidden',
    },
    canvas: {
      flex: 1,
    },
    hintWrap: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    hint: {
      fontSize: 15,
      color: colors.textMuted,
    },
    signLine: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 32,
      height: 1,
      backgroundColor: colors.border,
    },
    doneButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    doneButtonDisabled: {
      opacity: 0.4,
    },
    doneButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
  });
