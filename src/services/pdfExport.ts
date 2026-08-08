import RNFS from 'react-native-fs';
import {PDFDocument, PDFImage, degrees} from 'pdf-lib';
import {ensureExportsDir} from './fileStorage';
import {readFileBytes, writeFileBytes} from './pdfBytes';
import {renderPdfPage} from './pdfThumbnail';

/** Caps the combined canvas for `buildLongImage` so very long documents
 * don't ask the device to rasterize an impractically huge bitmap. */
const MAX_LONG_IMAGE_HEIGHT = 8000;

/**
 * Assembles a multi-page PDF from an ordered list of JPG file paths using
 * pdf-lib (pure JS — no native module, so it can't go out of sync with the
 * RN/Android toolchain). Each JPG is embedded on its own page sized to the
 * image's pixel dimensions at 72dpi.
 */
export async function buildPdfFromImages(
  pageFilePaths: string[],
  outputName: string,
): Promise<string> {
  if (pageFilePaths.length === 0) {
    throw new Error('Cannot build a PDF with zero pages');
  }

  const pdfDoc = await PDFDocument.create();

  for (const filePath of pageFilePaths) {
    const jpgBytes = await readFileBytes(filePath);
    const jpgImage = await pdfDoc.embedJpg(jpgBytes);
    const {width, height} = jpgImage.size();
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(jpgImage, {x: 0, y: 0, width, height});
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
