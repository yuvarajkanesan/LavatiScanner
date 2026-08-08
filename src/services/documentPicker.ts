import DocumentPicker, { types, isCancel } from 'react-native-document-picker';

export interface PickedPdf {
  uri: string;
  name: string;
}

/** Opens the system file picker restricted to PDFs. Returns null if the user cancels. */
export async function pickPdfFile(): Promise<PickedPdf | null> {
  try {
    const [result] = await DocumentPicker.pick({
      type: [types.pdf],
      copyTo: 'cachesDirectory',
    });
    const uri = result.fileCopyUri ?? result.uri;
    return { uri, name: result.name ?? 'document.pdf' };
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

/** Opens the system file picker restricted to PDFs, allowing multiple selections. */
export async function pickPdfFiles(): Promise<PickedPdf[]> {
  try {
    const results = await DocumentPicker.pick({
      type: [types.pdf],
      allowMultiSelection: true,
      copyTo: 'cachesDirectory',
    });
    return results.map(result => ({
      uri: result.fileCopyUri ?? result.uri,
      name: result.name ?? 'document.pdf',
    }));
  } catch (error) {
    if (isCancel(error)) return [];
    throw error;
  }
}
