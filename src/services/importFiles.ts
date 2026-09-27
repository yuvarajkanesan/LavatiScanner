import {pickGalleryImages, pickImportFiles} from './filePicker';
import {isPdfRenderable} from './pdfEdit';
import {renderAllPdfPages} from './pdfThumbnail';
import {saveSessionAsDocument} from './scanPipeline';
import {scanTimestampName} from '../utils/format';

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

export interface ImportResult {
  /** IDs of newly created documents, one per imported image/PDF. */
  createdDocIds: string[];
  /** Names of files that couldn't be imported (e.g. encrypted PDFs). */
  skipped: string[];
}

/** Opens the system file picker for images and PDFs, and turns each picked
 * file into its own document - never merged into one, since the user picked
 * unrelated files, not pages of the same scan. Returns `{[], []}` if the
 * picker is cancelled. */
export async function importFilesAsDocuments(
  folderId: string | null = null,
): Promise<ImportResult> {
  const {images, pdfs} = await pickImportFiles();
  const createdDocIds: string[] = [];
  const skipped: string[] = [];

  for (const image of images) {
    const docId = await saveSessionAsDocument({
      docName: stripExtension(image.name) || scanTimestampName(),
      folderId,
      pages: [{id: 'import-0', rawUri: image.uri, filter: 'original'}],
    });
    createdDocIds.push(docId);
  }

  for (const pdf of pdfs) {
    // Android's native page renderer throws an uncaught exception (not a
    // rejected promise) for any encrypted PDF, which would crash past a
    // try/catch here - so encrypted files are filtered out before ever
    // reaching it.
    if (!(await isPdfRenderable(pdf.uri))) {
      skipped.push(pdf.name);
      continue;
    }
    try {
      const rendered = await renderAllPdfPages(pdf.uri);
      const docId = await saveSessionAsDocument({
        docName: stripExtension(pdf.name) || scanTimestampName(),
        folderId,
        pages: rendered.map((r, i) => ({
          id: `import-${i}`,
          rawUri: r.uri,
          filter: 'original',
        })),
      });
      createdDocIds.push(docId);
    } catch (pdfError) {
      skipped.push(pdf.name);
    }
  }

  return {createdDocIds, skipped};
}

/** Opens the system gallery/image picker and turns each picked photo into
 * its own single-page document. Returns `{[], []}` if the picker is
 * cancelled. */
export async function importGalleryImagesAsDocuments(
  folderId: string | null = null,
): Promise<ImportResult> {
  const images = await pickGalleryImages();
  const createdDocIds: string[] = [];
  for (const image of images) {
    const docId = await saveSessionAsDocument({
      docName: stripExtension(image.name) || scanTimestampName(),
      folderId,
      pages: [{id: 'import-0', rawUri: image.uri, filter: 'original'}],
    });
    createdDocIds.push(docId);
  }
  return {createdDocIds, skipped: []};
}
