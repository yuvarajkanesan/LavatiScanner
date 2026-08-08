import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { setPageFilePath } from '../db/database';
import { deletePageFile, persistPageImage } from '../services/fileStorage';
import SignaturePad from '../components/SignaturePad';
import Icon from '../components/Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SignPage'>;

const SIG_MIN = 60;
const SIG_MAX = 220;
const SIG_DEFAULT = 130;

export default function SignPageScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { docId, pageId, filePath } = route.params;

  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [sigWidth, setSigWidth] = useState(SIG_DEFAULT);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const compositeRef = useRef<View>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startPos.current = pos;
      },
      onPanResponderMove: (_evt, gesture) => {
        setPos({ x: startPos.current.x + gesture.dx, y: startPos.current.y + gesture.dy });
      },
    }),
  ).current;

  function handleSignatureDone(uri: string) {
    setSignatureUri(uri);
  }

  function handleLayout(width: number, height: number) {
    setContainerSize({ width, height });
    const sigHeight = SIG_DEFAULT * 0.45;
    setPos({ x: width - SIG_DEFAULT - 16, y: height - sigHeight - 16 });
  }

  function resize(delta: number) {
    setSigWidth(w => Math.max(SIG_MIN, Math.min(SIG_MAX, w + delta)));
  }

  async function handleApply() {
    try {
      setSaving(true);
      const composedUri = await captureRef(compositeRef, { format: 'jpg', quality: 0.92 });
      const finalPath = await persistPageImage(docId, composedUri);
      const oldPath = filePath;
      await setPageFilePath(pageId, finalPath);
      await deletePageFile(oldPath);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', 'Could not apply the signature to this page.');
    } finally {
      setSaving(false);
    }
  }

  if (!signatureUri) {
    return (
      <SignaturePad onDone={handleSignatureDone} onCancel={() => navigation.goBack()} />
    );
  }

  const sigHeight = sigWidth * 0.45;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
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
        onLayout={e => handleLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
        <View ref={compositeRef} collapsable={false} style={styles.compositeArea}>
          <Image source={{ uri: `file://${filePath}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <View
            style={[styles.signatureOverlay, { left: pos.x, top: pos.y, width: sigWidth, height: sigHeight }]}
            {...panResponder.panHandlers}>
            <Image source={{ uri: signatureUri }} style={styles.signatureImage} resizeMode="contain" />
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.sizeBtn} onPress={() => resize(-20)}>
          <Icon name="remove" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.controlsHint}>Drag to position · pinch size with buttons</Text>
        <TouchableOpacity style={styles.sizeBtn} onPress={() => resize(20)}>
          <Icon name="add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.applyButton} onPress={handleApply} disabled={saving}>
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

const createStyles = (colors: AppColors) => StyleSheet.create({
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
