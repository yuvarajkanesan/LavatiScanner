import TextRecognition from '@react-native-ml-kit/text-recognition';

export async function recognizeTextFromImage(filePath: string): Promise<string> {
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const result = await TextRecognition.recognize(uri);
  return result.text ?? '';
}
