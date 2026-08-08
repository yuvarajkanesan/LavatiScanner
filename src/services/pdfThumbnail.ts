import PdfThumbnail from 'react-native-pdf-thumbnail';

export interface PdfPageThumb {
  uri: string;
  width: number;
  height: number;
}

/** Renders a single PDF page to a JPG file via Android's PdfRenderer. */
export async function renderPdfPage(
  filePath: string,
  pageIndex: number,
  quality = 70,
): Promise<PdfPageThumb> {
  return PdfThumbnail.generate(filePath, pageIndex, quality);
}

/** Renders every page of a PDF to JPG files. */
export async function renderAllPdfPages(
  filePath: string,
  quality = 70,
): Promise<PdfPageThumb[]> {
  return PdfThumbnail.generateAllPages(filePath, quality);
}
