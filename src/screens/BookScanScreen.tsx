import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {createDocument, addPage as addPageRecord} from '../db/database';
import {persistPageImage} from '../services/fileStorage';
import {cropImageFile} from '../services/pdfExport';
import {scanTimestampName} from '../utils/format';
import Icon from '../components/Icon';
import ImageCropEditor from '../components/ImageCropEditor';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'BookScan'>;

export default function BookScanScreen({navigation, route}: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const SCREEN_WIDTH = window.width - 32;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    const capturedUri = route.params?.capturedUri;
    if (capturedUri) {
      loadImage(`file://${capturedUri.replace('file://', '')}`);
    } else {
      // Defensive: this screen should only ever be reached with a photo
      // already captured by the unified camera. If it somehow isn't, send
      // the user straight into that camera.
      navigation.replace('Scan', {
        folderId: route.params?.folderId ?? null,
        mode: 'book',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadImage(cleanUri: string) {
    Image.getSize(
      cleanUri,
      (width, height) => {
        setImageSize({width, height});
        setImageUri(cleanUri);
      },
      () => {
        Alert.alert('Could not read image size');
        navigation.goBack();
      },
    );
  }

  function handleRetake() {
    navigation.replace('Scan', {
      folderId: route.params?.folderId ?? null,
      mode: 'book',
    });
  }

  // Nothing's saved as a document yet at this point, so cropping just
  // re-measures and swaps the in-memory preview - same `loadImage` path the
  // initial capture already goes through.
  function handleCropApply(croppedUri: string) {
    setCropping(false);
    loadImage(`file://${croppedUri.replace('file://', '')}`);
  }

  async function handleSplitAndSave() {
    if (!imageUri) {
      return;
    }
    try {
      setSaving(true);
      // Crop the full-resolution source photo directly (via the same
      // throwaway-PDF + native-PdfRenderer round-trip used elsewhere for
      // crops) rather than screenshotting the on-screen preview — the old
      // approach relied on a hidden capture rig + a fixed delay to let it
      // paint before view-shot read it, which could still race and produce
      // a solid-black page. This also captures at full camera resolution
      // instead of the screen-downscaled preview.
      const timestamp = scanTimestampName();
      const leftPath = await cropImageFile(
        imageUri,
        0,
        0,
        0.5,
        1,
        `book_left_${timestamp}`,
      );
      const rightPath = await cropImageFile(
        imageUri,
        0.5,
        0,
        0.5,
        1,
        `book_right_${timestamp}`,
      );

      const doc = await createDocument(
        `Book_${timestamp}`,
        route.params?.folderId ?? null,
      );
      const finalLeft = await persistPageImage(doc.id, leftPath);
      await addPageRecord(doc.id, finalLeft);
      const finalRight = await persistPageImage(doc.id, rightPath);
      await addPageRecord(doc.id, finalRight);

      navigation.replace('DocumentDetail', {docId: doc.id});
    } catch (error) {
      Alert.alert('Save failed', 'Could not split and save the book pages.');
    } finally {
      setSaving(false);
    }
  }

  // Width-only fit (no cap against available vertical space) could overflow
  // previewWrap and visually collide with the header/action bar - most
  // likely on a tablet's much wider screen, or in a short multi-window pane
  // - since RN doesn't clip a flex child's overflow by default. `maxHeight`
  // below bounds the box on both axes; `resizeMode="contain"` then fits the
  // image within whichever constraint is tighter, same effect as the
  // Math.min(maxW/w, maxH/h) scale math CropPageScreen/TrimPageScreen use.
  const maxPreviewHeight = window.height - insets.top - insets.bottom - 170;
  const displayHeight = imageSize
    ? Math.min(
        (SCREEN_WIDTH * imageSize.height) / imageSize.width,
        maxPreviewHeight,
      )
    : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Book — Split Pages</Text>
        <View style={styles.headerActions}>
          {imageUri && (
            <TouchableOpacity
              onPress={() => setCropping(true)}
              disabled={saving}
              hitSlop={8}>
              <Icon name="crop" size={22} color={colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleRetake} disabled={saving}>
            <Icon name="replay" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {!imageUri || !imageSize ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : (
        <>
          <View style={styles.previewWrap}>
            <Image
              source={{uri: imageUri}}
              style={{width: SCREEN_WIDTH, height: displayHeight}}
              resizeMode="contain"
            />
            <View style={styles.splitLine} />
          </View>

          <View style={[styles.actionBar, {paddingBottom: 14 + insets.bottom}]}>
            <TouchableOpacity
              style={styles.primaryButton}
              disabled={saving}
              onPress={handleSplitAndSave}>
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Icon name="call-split" size={18} color={colors.white} />
                  <Text style={styles.primaryButtonText}>
                    Split into 2 Pages
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {cropping && imageUri && (
        <Modal visible animationType="slide" onRequestClose={() => setCropping(false)}>
          <ImageCropEditor
            filePath={imageUri}
            onCancel={() => setCropping(false)}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  splitLine: {
    position: 'absolute',
    top: 16,
    bottom: 16,
    left: '50%',
    width: 2,
    backgroundColor: colors.accent,
  },
  actionBar: {
    padding: 14,
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
  },
});
