import RNFS from 'react-native-fs';
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  TextRenderingMode,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib';
import {ensureExportsDir} from './fileStorage';
import {readFileBytes, writeFileBytes} from './pdfBytes';
import {renderPdfPage} from './pdfThumbnail';
import {OcrBlockRatio} from '../types/models';

/** Caps the combined canvas for `buildLongImage` so very long documents
 * don't ask the device to rasterize an impractically huge bitmap. */
const MAX_LONG_IMAGE_HEIGHT = 8000;

/** Parses a `Page.ocrBlocks` JSON string (or null/invalid) into blocks, or
 * null if there's nothing usable — callers pass this straight through to
 * `buildPdfFromImages`'s optional per-page OCR blocks. */
export function parsePageOcrBlocks(
  ocrBlocks: string | null | undefined,
): OcrBlockRatio[] | null {
  if (!ocrBlocks) {
    return null;
  }
  try {
    const parsed = JSON.parse(ocrBlocks);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Draws each OCR'd line as invisible-but-selectable text (PDF text
 * rendering mode 3) positioned over the page image, using pdf-lib's public
 * low-level operator API (`pushOperators` + `setTextRenderingMode`) — not
 * `page.drawText()`, which has no way to request invisible mode. This is
 * what makes the exported PDF's text searchable/selectable/copyable in
 * viewers like Acrobat or Google Drive, without changing how the page looks
 * (the image is still what's actually painted).
 */
function drawInvisibleTextLayer(
  page: PDFPage,
  font: PDFFont,
  pageWidth: number,
  pageHeight: number,
  blocks: OcrBlockRatio[],
): void {
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  for (const block of blocks) {
    const text = block.text.trim();
    const boxWidth = block.width * pageWidth;
    const boxHeight = block.height * pageHeight;
    if (!text || boxWidth <= 0 || boxHeight <= 0) {
      continue;
    }
    try {
      // Size the invisible glyphs so their natural width roughly matches
      // the OCR'd line's own pixel width — close enough alignment with the
      // visible word underneath for tap-to-select, without needing
      // per-glyph kerning precision (it's never actually painted).
      const naturalWidth = font.widthOfTextAtSize(text, boxHeight);
      const size =
        naturalWidth > 0
          ? Math.min(boxHeight, (boxWidth / naturalWidth) * boxHeight)
          : boxHeight;
      const x = block.left * pageWidth;
      // `top` is measured from the top of the source image; PDF points are
      // bottom-left origin — same flip already used by addSignatureAtPosition.
      const y = pageHeight - block.top * pageHeight - boxHeight;

      page.pushOperators(
        pushGraphicsState(),
        beginText(),
        setTextRenderingMode(TextRenderingMode.Invisible),
        setFontAndSize(fontKey, size),
        setTextMatrix(1, 0, 0, 1, x, y),
        showText(font.encodeText(text)),
        endText(),
        popGraphicsState(),
      );
    } catch {
      // A single line with characters outside the embedded font's
      // supported encoding shouldn't fail the whole export — the page
      // still looks and works fine, it just won't include that one line
      // in the searchable layer.
    }
  }
}

/**
 * Assembles a multi-page PDF from an ordered list of JPG file paths using
 * pdf-lib (pure JS — no native module, so it can't go out of sync with the
 * RN/Android toolchain). Each JPG is embedded on its own page sized to the
 * image's pixel dimensions at 72dpi. When `pagesOcrBlocks` is given (parallel
 * array, aligned by index to `pageFilePaths`), pages with OCR data get an
 * invisible searchable-text layer; pages without it (OCR still pending, or
 * none available) just get the plain image, unchanged from before.
 */
export async function buildPdfFromImages(
  pageFilePaths: string[],
  outputName: string,
  pagesOcrBlocks?: (OcrBlockRatio[] | null)[],
): Promise<string> {
  if (pageFilePaths.length === 0) {
    throw new Error('Cannot build a PDF with zero pages');
  }

  const pdfDoc = await PDFDocument.create();
  const needsTextLayer = pagesOcrBlocks?.some(
    blocks => blocks && blocks.length > 0,
  );
  const invisibleFont = needsTextLayer
    ? await pdfDoc.embedFont(StandardFonts.Helvetica)
    : null;

  for (let i = 0; i < pageFilePaths.length; i++) {
    const jpgBytes = await readFileBytes(pageFilePaths[i]);
    const jpgImage = await pdfDoc.embedJpg(jpgBytes);
    const {width, height} = jpgImage.size();
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(jpgImage, {x: 0, y: 0, width, height});

    const blocks = pagesOcrBlocks?.[i];
    if (blocks && blocks.length > 0 && invisibleFont) {
      drawInvisibleTextLayer(page, invisibleFont, width, height, blocks);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, pdfBytes);
  return outputPath;
}

/**
 * Rotates a JPG 90° clockwise by round-tripping it through a throwaway
 * 1-page PDF: wrap the image, set the PDF page's rotation with pdf-lib
 * (reliable, pure JS), then rasterize that rotated page back to a JPG via
 * Android's native PdfRenderer (`renderPdfPage`) — the same renderer this
 * app already relies on elsewhere for PDF thumbnails/export, so the
 * rotation is guaranteed to actually be baked into the output pixels.
 * This avoids capturing a hidden/off-screen RN view, which proved
 * unreliable (produced solid-black output) for this exact use case.
 */
export async function rotateImageFile90(
  sourcePath: string,
  outputName: string,
  rotationDegrees: 90 | 180 | 270 = 90,
): Promise<string> {
  const jpgBytes = await readFileBytes(sourcePath);
  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpgBytes);
  const {width, height} = jpgImage.size();
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(jpgImage, {x: 0, y: 0, width, height});
  page.setRotation(degrees(rotationDegrees));

  const pdfBytes = await pdfDoc.save();
  const exportsDir = await ensureExportsDir();
  const tempPdfPath = `${exportsDir}/${outputName}_rotate_tmp.pdf`;
  await writeFileBytes(tempPdfPath, pdfBytes);

  try {
    const rendered = await renderPdfPage(tempPdfPath, 0, 92);
    return rendered.uri;
  } finally {
    RNFS.unlink(tempPdfPath).catch(() => undefined);
  }
}

/**
 * Stitches an ordered list of JPGs into a single tall JPG ("long image"),
 * stacked top to bottom. Uses the same throwaway-PDF + native-PdfRenderer
 * round-trip as `rotateImageFile90` — pdf-lib composes the images onto one
 * oversized page (reliable, pure JS), then Android rasterizes that single
 * page back to a JPG, rather than compositing via a captured RN view.
 */
export async function buildLongImage(
  pageFilePaths: string[],
  outputName: string,
): Promise<string> {
  if (pageFilePaths.length === 0) {
    throw new Error('Cannot build a long image with zero pages');
  }

  const pdfDoc = await PDFDocument.create();
  const embedded: {image: PDFImage; width: number; height: number}[] = [];
  let totalHeight = 0;
  let maxWidth = 0;

  for (const filePath of pageFilePaths) {
    const jpgBytes = await readFileBytes(filePath);
    const image = await pdfDoc.embedJpg(jpgBytes);
    const {width, height} = image.size();
    embedded.push({image, width, height});
    totalHeight += height;
    maxWidth = Math.max(maxWidth, width);
  }

  const scale =
    totalHeight > MAX_LONG_IMAGE_HEIGHT
      ? MAX_LONG_IMAGE_HEIGHT / totalHeight
      : 1;
  const pageWidth = maxWidth * scale;
  const pageHeight = totalHeight * scale;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yCursor = pageHeight;
  for (const {image, width, height} of embedded) {
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    yCursor -= drawHeight;
    page.drawImage(image, {
      x: 0,
      y: yCursor,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const exportsDir = await ensureExportsDir();
  const tempPdfPath = `${exportsDir}/${outputName}_long_tmp.pdf`;
  await writeFileBytes(tempPdfPath, pdfBytes);

  try {
    const rendered = await renderPdfPage(tempPdfPath, 0, 90);
    return rendered.uri;
  } finally {
    RNFS.unlink(tempPdfPath).catch(() => undefined);
  }
}

/**
 * Crops a JPG to the given region — expressed as 0..1 ratios of the source
 * image's own width/height, top-left origin — via the same throwaway-PDF +
 * native-PdfRenderer round-trip used elsewhere in this file. The PDF page
 * is sized to exactly the crop rectangle and the full image is drawn
 * offset behind it, so only the desired region falls inside the page's
 * bounds and gets rasterized; this keeps the crop in true pixel space
 * (no resolution loss from capturing an on-screen preview).
 */
export async function cropImageFile(
  sourcePath: string,
  cropXRatio: number,
  cropYRatio: number,
  cropWidthRatio: number,
  cropHeightRatio: number,
  outputName: string,
): Promise<string> {
  const jpgBytes = await readFileBytes(sourcePath);
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedJpg(jpgBytes);
  const {width: imgWidth, height: imgHeight} = image.size();

  const cropX = cropXRatio * imgWidth;
  const cropY = cropYRatio * imgHeight;
  const cropWidth = Math.max(1, cropWidthRatio * imgWidth);
  const cropHeight = Math.max(1, cropHeightRatio * imgHeight);

  const page = pdfDoc.addPage([cropWidth, cropHeight]);
  page.drawImage(image, {
    x: -cropX,
    y: -(imgHeight - cropY - cropHeight),
    width: imgWidth,
    height: imgHeight,
  });

  const pdfBytes = await pdfDoc.save();
  const exportsDir = await ensureExportsDir();
  const tempPdfPath = `${exportsDir}/${outputName}_crop_tmp.pdf`;
  await writeFileBytes(tempPdfPath, pdfBytes);

  try {
    const rendered = await renderPdfPage(tempPdfPath, 0, 92);
    return rendered.uri;
  } finally {
    RNFS.unlink(tempPdfPath).catch(() => undefined);
  }
}
