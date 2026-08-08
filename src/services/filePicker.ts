import DocumentPicker, { types, isCancel } from 'react-native-document-picker';

export interface ImportPickResult {
  images: { uri: string; name: string }[];
  pdfs: { uri: string; name: string }[];
}

/** Opens the system file picker for images and PDFs together. Returns empty arrays if cancelled. */
export async function pickImportFiles(): Promise<ImportPickResult> {
  try {
    const results = await DocumentPicker.pick({
      type: [types.images, types.pdf],
      allowMultiSelection: true,
      copyTo: 'cachesDirectory',
    });

    const images: { uri: string; name: string }[] = [];
    const pdfs: { uri: string; name: string }[] = [];
    for (const result of results) {
      const uri = result.fileCopyUri ?? result.uri;
      if (result.type === types.pdf || /\.pdf$/i.test(result.name ?? '')) {
        pdfs.push({ uri, name: result.name ?? 'document.pdf' });
      } else {
        images.push({ uri, name: result.name ?? 'image.jpg' });
      }
    }
    return { images, pdfs };
  } catch (error) {
    if (isCancel(error)) return { images: [], pdfs: [] };
    throw error;
  }
}
