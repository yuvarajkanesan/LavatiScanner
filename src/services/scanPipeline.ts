import { Image } from 'react-native';
import type { TextBlock } from '@react-native-ml-kit/text-recognition';
import {
  createDocument,
  addPage as addPageRecord,
  getDocument,
  renameDocument,
  setPageOcrBlocks,
  setPageOcrText,
} from '../db/database';
import { persistPageImage } from './fileStorage';
import { recognizeTextWithBlocks } from './ocr';
import { SessionPage } from '../context/ScanSessionContext';
import { OcrBlockRatio } from '../types/models';

const DEFAULT_NAME_PATTERN = /^Scan_\d{8}_\d{6}$/;
const MAX_AUTO_NAME_LENGTH = 40;

/**
 * Persists every page of a finished scan session: copies each page's
 * (already filter-baked) image into permanent per-document storage and
 * writes the document + page rows to SQLite.
 */
export async function saveSessionAsDocument(session: {
  docName: string;
  folderId: string | null;
  pages: SessionPage[];
}): Promise<string> {
  if (session.pages.length === 0) {
    throw new Error('Cannot save a document with zero pages');
  }

  const doc = await createDocument(session.docName.trim() || 'Untitled', session.folderId);

  const savedPages: {id: string; filePath: string}[] = [];
  for (const page of session.pages) {
    const finalPath = await persistPageImage(doc.id, page.rawUri);
    const record = await addPageRecord(doc.id, finalPath);
    savedPages.push({id: record.id, filePath: finalPath});
  }

  runBackgroundOcr(doc.id, savedPages, true);

  return doc.id;
}

/** Appends session pages to an already-existing document (the "Add page" flow from Document Detail). */
export async function appendSessionToDocument(
  docId: string,
  pages: SessionPage[],
): Promise<void> {
  const savedPages: {id: string; filePath: string}[] = [];
  for (const page of pages) {
    const finalPath = await persistPageImage(docId, page.rawUri);
    const record = await addPageRecord(docId, finalPath);
    savedPages.push({id: record.id, filePath: finalPath});
  }
  runBackgroundOcr(docId, savedPages, false);
}

function getImageSize(uri: string): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({width, height}), reject);
  });
}

/** Flattens ML Kit's block/line tree to line-level boxes (a good balance —
 * precise enough to select cleanly, far fewer PDF text-draw operators than
 * word-level), converted from ML Kit's source-image pixel coordinates to
 * 0..1 ratios (matching the ratio convention `addSignatureAtPosition`
 * already uses in services/pdfEdit.ts). */
function blocksToLineRatios(
  blocks: TextBlock[],
  imgWidth: number,
  imgHeight: number,
): OcrBlockRatio[] {
  if (imgWidth === 0 || imgHeight === 0) {
    return [];
  }
  const out: OcrBlockRatio[] = [];
  for (const block of blocks) {
    for (const line of block.lines) {
      if (!line.frame) {
        continue;
      }
      out.push({
        text: line.text,
        left: line.frame.left / imgWidth,
        top: line.frame.top / imgHeight,
        width: line.frame.width / imgWidth,
        height: line.frame.height / imgHeight,
      });
    }
  }
  return out;
}

function suggestNameFromText(text: string): string | null {
  const firstLine = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0);
  if (!firstLine) {
    return null;
  }
  return firstLine.length > MAX_AUTO_NAME_LENGTH
    ? firstLine.slice(0, MAX_AUTO_NAME_LENGTH).trim()
    : firstLine;
}

/**
 * Fire-and-forget: OCRs every page of a just-saved document in the
 * background (never awaited by callers, so saving/navigating stays
 * instant), persists text + position data for search and the
 * searchable-PDF text layer, and — only when `allowAutoRename` and the
 * document's name is *still* the untouched "Scan_..." default at the
 * moment OCR finishes (checked fresh from the DB, so a manual rename made
 * in the meantime is never clobbered) — renames it to a guess based on the
 * first page's recognized text.
 */
function runBackgroundOcr(
  docId: string,
  pages: {id: string; filePath: string}[],
  allowAutoRename: boolean,
): void {
  (async () => {
    let attemptedRename = !allowAutoRename;
    for (const page of pages) {
      try {
        const {text, blocks} = await recognizeTextWithBlocks(page.filePath);
        await setPageOcrText(page.id, text);

        if (blocks.length > 0) {
          try {
            const {width, height} = await getImageSize(
              `file://${page.filePath}`,
            );
            const ratios = blocksToLineRatios(blocks, width, height);
            if (ratios.length > 0) {
              await setPageOcrBlocks(page.id, JSON.stringify(ratios));
            }
          } catch {
            // Image.getSize failing shouldn't drop the plain OCR text already saved above.
          }
        }

        if (!attemptedRename) {
          attemptedRename = true;
          const suggested = suggestNameFromText(text);
          if (suggested) {
            const current = await getDocument(docId);
            if (current && DEFAULT_NAME_PATTERN.test(current.name)) {
              await renameDocument(docId, suggested);
            }
          }
        }
      } catch {
        // Best-effort background pass — OCR failures shouldn't surface to the user.
      }
    }
  })();
}
