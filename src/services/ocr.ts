import TextRecognition, {
  TextBlock,
} from '@react-native-ml-kit/text-recognition';

export async function recognizeTextFromImage(filePath: string): Promise<string> {
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const result = await TextRecognition.recognize(uri);
  return result.text ?? '';
}

export interface OcrResult {
  text: string;
  blocks: TextBlock[];
}

/** Same recognition as `recognizeTextFromImage`, but also returns ML Kit's
 * block-level bounding boxes (pixel coordinates in the source image's own
 * space) — used for the background OCR pass, which needs page positions for
 * the searchable-PDF text layer, not just the flat string. */
export async function recognizeTextWithBlocks(
  filePath: string,
): Promise<OcrResult> {
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const result = await TextRecognition.recognize(uri);
  return {text: result.text ?? '', blocks: result.blocks ?? []};
}
