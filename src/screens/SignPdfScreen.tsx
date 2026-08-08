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
import Share from 'react-native-share';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {pickPdfFile} from '../services/documentPicker';
import {
  addSignatureAtPosition,
  getPdfPageCount,
  isPdfRenderable,
} from '../services/pdfEdit';
import {renderPdfPage} from '../services/pdfThumbnail';
import SignaturePad from '../components/SignaturePad';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Step = 'pick' | 'choosePage' | 'draw' | 'position' | 'applying';

const SIG_MIN = 60;
const SIG_MAX = 220;
const SIG_DEFAULT = 130;

export default function SignPdfScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pagePreview, setPagePreview] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [sigWidth, setSigWidth] = useState(SIG_DEFAULT);
  const [pos, setPos] = useState({x: 0, y: 0});
  const [containerSize, setContainerSize] = useState({width: 0, height: 0});
  const [saving, setSaving] = useState(false);
  const startPos = useRef({x: 0, y: 0});

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startPos.current = pos;
      },
      onPanResponderMove: (_evt, gesture) => {
        setPos({
          x: startPos.current.x + gesture.dx,
          y: startPos.current.y + gesture.dy,
        });
      },
    }),
  ).current;

  async function handlePick() {
    const picked = await pickPdfFile();
    if (!picked) {
      return;
    }

    try {
      setLoadingPdf(true);
      // Signing here relies on rendering a page image to drag the signature
      // over, so this needs the stricter renderability check, not just the
      // pdf-lib-can-open-it check `getPdfPageCount` implies.
      if (!(await isPdfRenderable(picked.uri))) {
        Alert.alert(
          "Can't preview this PDF",
          "This PDF is password-protected, so its pages can't be shown for positioning. Remove its restrictions first in Tools > Remove Restrictions.",
        );
        return;
      }
      const count = await getPdfPageCount(picked.uri);
      setFileUri(picked.uri);
      setFileName(picked.name);
      setPageCount(count);
      setPageIndex(count - 1);
      setStep('choosePage');
    } catch (error) {
      Alert.alert(
        'Could not open PDF',
        'This file may be password-protected or corrupted.',
      );
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleSignatureDone(uri: string) {
    if (!fileUri) {
      return;
    }
    setSignatureUri(uri);
    try {
      setLoadingPreview(true);
      const preview = await renderPdfPage(fileUri, pageIndex);
      setPagePreview(preview);
      setStep('position');
    } catch (error) {
      Alert.alert(
        'Preview failed',
        'Could not render this page for positioning.',
      );
      setStep('choosePage');
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleLayout(width: number, height: number) {
    setContainerSize({width, height});
    const sigHeight = SIG_DEFAULT * 0.45;
    setPos({x: width - SIG_DEFAULT - 16, y: height - sigHeight - 16});
  }

  function resize(delta: number) {
    setSigWidth(w => Math.max(SIG_MIN, Math.min(SIG_MAX, w + delta)));
  }

  async function handleApply() {
    if (!fileUri || !fileName || !signatureUri || containerSize.width === 0) {
      return;
    }
    try {
      setSaving(true);
      const sigHeight = sigWidth * 0.45;
      const xRatio = pos.x / containerSize.width;
      const yRatio = pos.y / containerSize.height;
      const widthRatio = sigWidth / containerSize.width;
      const heightRatio = sigHeight / containerSize.height;

      const outputName = fileName.replace(/\.pdf$/i, '') + '_signed';
      const outputPath = await addSignatureAtPosition(
        fileUri,
        signatureUri,
        pageIndex,
        xRatio,
        yRatio,
        widthRatio,
        heightRatio,
        outputName,
      );
      await Share.open({
        url: `file://${outputPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
      setStep('pick');
      setFileUri(null);
      setFileName(null);
      setSignatureUri(null);
      setPagePreview(null);
    } catch (error) {
      Alert.alert('Save failed', 'Could not add the signature to this PDF.');
      setStep('choosePage');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'draw') {
    return (
      <SignaturePad
        onDone={handleSignatureDone}
        onCancel={() => setStep('choosePage')}
      />
    );
  }

  if (step === 'position' && pagePreview) {
    const sigHeight = sigWidth * 0.45;
    return (
      <View style={styles.positionContainer}>
        <View style={[styles.positionHeader, {paddingTop: insets.top + 10}]}>
          <TouchableOpacity onPress={() => setStep('draw')} hitSlop={8}>
            <Icon name="replay" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.positionTitle}>Position Signature</Text>
          <TouchableOpacity onPress={() => setStep('choosePage')} hitSlop={8}>
            <Icon name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.previewWrap,
            {aspectRatio: pagePreview.width / pagePreview.height},
          ]}
          onLayout={e =>
            handleLayout(
              e.nativeEvent.layout.width,
              e.nativeEvent.layout.height,
            )
          }>
          <Image
            source={{uri: pagePreview.uri}}
            style={StyleSheet.absoluteFill}
            resizeMode="stretch"
          />
          {loadingPreview ? null : (
            <View
              style={[
                styles.signatureOverlay,
                {left: pos.x, top: pos.y, width: sigWidth, height: sigHeight},
              ]}
              {...panResponder.panHandlers}>
              <Image
                source={{uri: signatureUri ?? undefined}}
                style={styles.signatureImage}
                resizeMode="contain"
              />
            </View>
          )}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.sizeBtn} onPress={() => resize(-20)}>
            <Icon name="remove" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.controlsHint}>
            Drag to position · resize with buttons
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

  if (step === 'choosePage' && fileName) {
    return (
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Icon name="draw" size={40} color={colors.accent} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={styles.description}>
          Pick the page to sign, then draw your signature and drag it into place
          on that page.
        </Text>

        <View style={styles.pageStepper}>
          <TouchableOpacity
            style={styles.stepperBtn}
            disabled={pageIndex === 0}
            onPress={() => setPageIndex(p => Math.max(0, p - 1))}>
            <Icon
              name="chevron-left"
              size={22}
              color={pageIndex === 0 ? colors.textMuted : colors.accent}
            />
          </TouchableOpacity>
          <Text style={styles.stepperText}>
            Page {pageIndex + 1} of {pageCount}
          </Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            disabled={pageIndex === pageCount - 1}
            onPress={() => setPageIndex(p => Math.min(pageCount - 1, p + 1))}>
            <Icon
              name="chevron-right"
              size={22}
              color={
                pageIndex === pageCount - 1 ? colors.textMuted : colors.accent
              }
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={() => setStep('draw')}>
          <Icon name="draw" size={18} color={colors.white} />
          <Text style={styles.buttonText}>Draw Signature</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Icon name="draw" size={40} color={colors.accent} />
      </View>
      <Text style={styles.title}>Sign a PDF</Text>
      <Text style={styles.description}>
        Pick a PDF, draw your signature, then drag it onto the page exactly
        where you want it.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handlePick}
        disabled={loadingPdf}>
        {loadingPdf ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name="file-open" size={18} color={colors.white} />
            <Text style={styles.buttonText}>Choose PDF</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      backgroundColor: colors.background,
    },
    iconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    description: {
      marginTop: 8,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    pageStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 24,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      minWidth: 110,
      textAlign: 'center',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      height: 50,
      paddingHorizontal: 28,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    buttonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
    positionContainer: {
      flex: 1,
      backgroundColor: colors.black,
    },
    positionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingBottom: 12,
    },
    positionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
    previewWrap: {
      width: '100%',
      marginTop: 4,
      alignSelf: 'center',
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
      paddingVertical: 14,
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
