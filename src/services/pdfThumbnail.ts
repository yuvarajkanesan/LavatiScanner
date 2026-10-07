import {NativeModules} from 'react-native';
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

/** Longest side (px) for editor page renders - roughly A4 at 200 dpi. The
 * stock renderers above draw at the PDF's native point size (~595px wide),
 * which looks soft full-screen and gets worse once a filter sharpens it. */
export const HD_PAGE_LONG_SIDE = 1800;

/** Renders one page (`pageIndex`) or every page (-1) at `longSide` pixels via
 * the app's own native PdfRenderer wrapper. Falls back to the stock
 * low-resolution renderer if the native method is unavailable. */
export async function renderPdfPagesHd(
  filePath: string,
  pageIndex: number,
  longSide: number = HD_PAGE_LONG_SIDE,
  quality = 90,
): Promise<PdfPageThumb[]> {
  const native = NativeModules.ImageFilterModule;
  if (!native?.renderPdfPages) {
    return pageIndex < 0
      ? renderAllPdfPages(filePath, quality)
      : [await renderPdfPage(filePath, pageIndex, quality)];
  }
  return native.renderPdfPages(
    filePath.replace('file://', ''),
    pageIndex,
    longSide,
    quality,
  );
}
