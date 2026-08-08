import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { createDocument, addPage as addPageRecord } from '../db/database';
import { persistPageImage } from '../services/fileStorage';
import { scanTimestampName } from '../utils/format';
import Icon from '../components/Icon';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'BookScan'>;

const SCREEN_WIDTH = Dimensions.get('window').width - 32;

export default function BookScanScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const leftHalfRef = useRef<View>(null);
  const rightHalfRef = useRef<View>(null);

  useEffect(() => {
    captureSpread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function captureSpread() {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      if (status !== ScanDocumentResponseStatus.Success || !scannedImages?.length) {
        navigation.goBack();
        return;
      }

      const uri = scannedImages[0];
      const cleanUri = `file://${uri.replace('file://', '')}`;
      Image.getSize(
        cleanUri,
        (width, height) => {
          setImageSize({ width, height });
          setImageUri(cleanUri);
        },
        () => {
          Alert.alert('Could not read image size');
          navigation.goBack();
        },
      );
    } catch (error) {
      Alert.alert('Scan failed', 'Could not capture the book spread.');
      navigation.goBack();
    }
  }

  async function handleSplitAndSave() {
    if (!imageUri || !imageSize) return;
    try {
      setSaving(true);
      const leftPath = await captureRef(leftHalfRef, { format: 'jpg', quality: 0.92 });
      const rightPath = await captureRef(rightHalfRef, { format: 'jpg', quality: 0.92 });

      const doc = await createDocument(`Book_${scanTimestampName()}`, route.params?.folderId ?? null);
      const finalLeft = await persistPageImage(doc.id, leftPath);
      await addPageRecord(doc.id, finalLeft);
      const finalRight = await persistPageImage(doc.id, rightPath);
      await addPageRecord(doc.id, finalRight);

      navigation.replace('DocumentDetail', { docId: doc.id });
    } catch (error) {
      Alert.alert('Save failed', 'Could not split and save the book pages.');
    } finally {
      setSaving(false);
    }
  }

  const displayHeight = imageSize ? (SCREEN_WIDTH * imageSize.height) / imageSize.width : 0;
  const halfWidth = SCREEN_WIDTH / 2;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Book — Split Pages</Text>
        <TouchableOpacity onPress={captureSpread} disabled={saving}>
          <Icon name="replay" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {!imageUri || !imageSize ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : (
        <>
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: SCREEN_WIDTH, height: displayHeight }}
              resizeMode="contain"
            />
            <View style={styles.splitLine} />
          </View>

          {/* Off-screen capture rigs: each clips the full image to one half. */}
          <View style={styles.offscreen} pointerEvents="none">
            <View
              ref={leftHalfRef}
              collapsable={false}
              style={{ width: halfWidth, height: displayHeight, overflow: 'hidden' }}>
              <Image source={{ uri: imageUri }} style={{ width: SCREEN_WIDTH, height: displayHeight }} resizeMode="contain" />
            </View>
            <View
              ref={rightHalfRef}
              collapsable={false}
              style={{ width: halfWidth, height: displayHeight, overflow: 'hidden' }}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: SCREEN_WIDTH, height: displayHeight, marginLeft: -halfWidth }}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={[styles.actionBar, { paddingBottom: 14 + insets.bottom }]}>
            <TouchableOpacity style={styles.primaryButton} disabled={saving} onPress={handleSplitAndSave}>
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Icon name="call-split" size={18} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Split into 2 Pages</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
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
  offscreen: {
    position: 'absolute',
    opacity: 0,
    flexDirection: 'row',
    top: -9999,
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
