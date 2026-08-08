import {degrees, PDFDocument, rgb, StandardFonts} from 'pdf-lib';
import {ensureExportsDir} from './fileStorage';
import {readFileBytes, writeFileBytes} from './pdfBytes';

export interface EditablePage {
  /** Index of this page in the originally loaded PDF. */
  originalIndex: number;
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Loads a PDF for editing. `ignoreEncryption` lets this open PDFs that only
 * have owner-password restrictions (edit/print/copy locks) rather than a
 * real open-password — those decode fine since the content itself isn't
 * encrypted, only the permissions flag is set.
 */
export async function loadPdfForEditing(uri: string): Promise<PDFDocument> {
  const bytes = await readFileBytes(uri);
  return PDFDocument.load(bytes, {ignoreEncryption: true});
}

export async function getPdfPageCount(uri: string): Promise<number> {
  const doc = await loadPdfForEditing(uri);
  return doc.getPageCount();
}

/**
 * True if this PDF has no encryption dictionary at all. Android's built-in
 * PdfRenderer (used for page thumbnails/preview) refuses to open ANY
 * encrypted PDF, even ones with only owner-password/permission locks that
 * pdf-lib's `ignoreEncryption` can open fine for editing — so this is a
 * stricter, separate check to gate calls into the native page renderer.
 */
export async function isPdfRenderable(uri: string): Promise<boolean> {
  try {
    const bytes = await readFileBytes(uri);
    await PDFDocument.load(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-saves a PDF with no encryption/restrictions. Works for PDFs that open
 * freely but block editing/printing/copying. Cannot open a PDF that
 * requires a password just to view — that needs real decryption, which
 * pdf-lib does not implement.
 */
export async function removePdfRestrictions(
  uri: string,
  outputName: string,
): Promise<string> {
  const doc = await loadPdfForEditing(uri);
  const bytes = await doc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, bytes);
  return outputPath;
}

/**
 * Builds a new PDF from a source document given the desired page order,
 * per-page rotation, and deletions (pages simply omitted from `pages`).
 */
export async function buildEditedPdf(
  sourceDoc: PDFDocument,
  pages: EditablePage[],
  outputName: string,
): Promise<string> {
  if (pages.length === 0) {
    throw new Error('Cannot save a PDF with zero pages');
  }

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(
    sourceDoc,
    pages.map(p => p.originalIndex),
  );

  copiedPages.forEach((page, i) => {
    if (pages[i].rotation !== 0) {
      page.setRotation(degrees(pages[i].rotation));
    }
    newDoc.addPage(page);
  });

  const bytes = await newDoc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, bytes);
  return outputPath;
}

/**
 * Stamps a signature image onto one page of a PDF at a user-chosen spot.
 * `xRatio`/`yRatio` are the top-left corner of the signature as a fraction
 * of the page width/height (0..1, y measured from the top, matching how the
 * user dragged it on screen); `widthRatio`/`heightRatio` are its size as a
 * fraction of the page. These get converted into PDF point coordinates
 * (origin bottom-left) for `drawImage` — only the signature is rasterized,
 * the rest of the page stays untouched.
 */
export async function addSignatureAtPosition(
  uri: string,
  signaturePngUri: string,
  pageIndex: number,
  xRatio: number,
  yRatio: number,
  widthRatio: number,
  heightRatio: number,
  outputName: string,
): Promise<string> {
  const doc = await loadPdfForEditing(uri);
  const page = doc.getPage(pageIndex);
  const {width, height} = page.getSize();

  const signatureBytes = await readFileBytes(signaturePngUri);
  const signatureImage = await doc.embedPng(signatureBytes);

  const drawWidth = widthRatio * width;
  const drawHeight = heightRatio * height;
  const x = xRatio * width;
  const y = height - yRatio * height - drawHeight;

  page.drawImage(signatureImage, {x, y, width: drawWidth, height: drawHeight});

  const bytes = await doc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, bytes);
  return outputPath;
}

export type MergeSource =
  | {type: 'images'; filePaths: string[]}
  | {type: 'pdf'; uri: string};

/**
 * Merges an ordered mix of scanned-page image sets and whole external PDFs
 * into one PDF. External PDF pages are copied over with pdf-lib's
 * `copyPages` (not rasterized), so their text/quality is preserved.
 */
export async function mergeMixedToPdf(
  sources: MergeSource[],
  outputName: string,
): Promise<string> {
  if (sources.length === 0) {
    throw new Error('Nothing to merge');
  }

  const newDoc = await PDFDocument.create();

  for (const source of sources) {
    if (source.type === 'images') {
      for (const filePath of source.filePaths) {
        const jpgBytes = await readFileBytes(filePath);
        const jpgImage = await newDoc.embedJpg(jpgBytes);
        const {width, height} = jpgImage.size();
        const page = newDoc.addPage([width, height]);
        page.drawImage(jpgImage, {x: 0, y: 0, width, height});
      }
    } else {
      const bytes = await readFileBytes(source.uri);
      const srcDoc = await PDFDocument.load(bytes, {ignoreEncryption: true});
      const copiedPages = await newDoc.copyPages(
        srcDoc,
        srcDoc.getPageIndices(),
      );
      copiedPages.forEach(page => newDoc.addPage(page));
    }
  }

  const bytes = await newDoc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, bytes);
  return outputPath;
}

/**
 * Stamps a single centered, diagonal, translucent text watermark onto every
 * page of a PDF (e.g. "CONFIDENTIAL" or "DRAFT").
 */
export async function addWatermarkToPdf(
  uri: string,
  text: string,
  outputName: string,
): Promise<string> {
  const doc = await loadPdfForEditing(uri);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const angleDegrees = 45;
  const angleRad = (angleDegrees * Math.PI) / 180;

  for (const page of doc.getPages()) {
    const {width, height} = page.getSize();
    const fontSize = Math.min(width, height) * 0.1;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = width / 2 - (textWidth / 2) * Math.cos(angleRad);
    const y = height / 2 - (textWidth / 2) * Math.sin(angleRad);

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.35,
      rotate: degrees(angleDegrees),
    });
  }

  const bytes = await doc.save();
  const exportsDir = await ensureExportsDir();
  const outputPath = `${exportsDir}/${outputName}.pdf`;
  await writeFileBytes(outputPath, bytes);
  return outputPath;
}
