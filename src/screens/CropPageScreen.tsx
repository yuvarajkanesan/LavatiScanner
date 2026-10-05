import React from 'react';
import Alert from '../utils/customAlert';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {setPageFilePath} from '../db/database';
import {deletePageFile, persistPageImage} from '../services/fileStorage';
import ImageCropEditor from '../components/ImageCropEditor';

type Props = NativeStackScreenProps<RootStackParamList, 'CropPage'>;

export default function CropPageScreen({navigation, route}: Props) {
  const {docId, pageId, filePath} = route.params;

  async function handleApply(croppedUri: string) {
    try {
      const newPath = await persistPageImage(docId, croppedUri);
      await deletePageFile(filePath);
      await setPageFilePath(pageId, newPath);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Crop failed', 'Could not crop this page.');
    }
  }

  return (
    <ImageCropEditor
      filePath={filePath}
      onCancel={() => navigation.goBack()}
      onApply={handleApply}
    />
  );
}
