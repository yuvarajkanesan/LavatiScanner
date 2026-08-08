import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { RootStackParamList } from '../navigation/types';
import { useScanSession } from '../context/ScanSessionContext';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

/**
 * react-native-document-scanner-plugin owns the entire capture flow:
 * it opens the camera, live-detects the document edges, lets the user
 * snap the photo, and shows its own native crop screen with draggable
 * corners for manual adjustment before returning the final cropped
 * image. There is no JS hook into that intermediate crop UI, so this
 * screen's only job is to kick it off and route the result onward.
 */
export default function ScanScreen({ navigation, route }: Props) {
  const session = useScanSession();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!session.targetDocId && session.pages.length === 0) {
      session.startSession(route.params?.folderId ?? null);
    }

    (async () => {
      try {
        const { scannedImages, status } = await DocumentScanner.scanDocument({
          responseType: ResponseType.ImageFilePath,
          maxNumDocuments: 1,
          croppedImageQuality: 90,
        });

        if (status === ScanDocumentResponseStatus.Success && scannedImages?.length) {
          const pageId = session.addPage(scannedImages[0]);
          navigation.replace('Filter', { pageId });
        } else {
          handleCancel();
        }
      } catch (error) {
        handleCancel();
      }
    })();

    function handleCancel() {
      if (session.pages.length === 0) {
        navigation.goBack();
      } else {
        navigation.goBack();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.white} size="large" />
      <Text style={styles.text}>Opening camera…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.white,
    marginTop: 12,
    fontSize: 14,
  },
});
