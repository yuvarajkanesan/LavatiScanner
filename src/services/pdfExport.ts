import { PDFDocument } from 'pdf-lib';
import { ensureExportsDir } from './fileStorage';
import { readFileBytes, writeFileBytes } from './pdfBytes';

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
    const { width, height } = jpgImage.size();
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(jpgImage, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await pdfDoc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, pdfBytes);
  return outputPath;
}
