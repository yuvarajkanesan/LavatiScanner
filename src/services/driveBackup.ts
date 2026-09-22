import RNFS from 'react-native-fs';
import {listDocuments, listPages, setDocumentDriveSync} from '../db/database';
import {buildPdfFromImages, parsePageOcrBlocks} from './pdfExport';
import {uploadFileToDrive} from './googleDrive';
import {DocumentSummary} from '../types/models';

export interface BackupProgress {
  current: number;
  total: number;
  documentName: string;
}

export interface BackupSummary {
  succeeded: number;
  failed: number;
  errors: {documentName: string; error: string}[];
}

/** Builds `doc`'s current PDF and uploads it to the app's Drive folder,
 * updating the existing Drive file in place if this document was backed up
 * before. Safe to call repeatedly - each call re-exports the latest pages. */
export async function backupDocumentToDrive(
  doc: DocumentSummary,
): Promise<void> {
  const pages = await listPages(doc.id);
  if (pages.length === 0) {
    return;
  }
  const pdfPath = await buildPdfFromImages(
    pages.map(p => p.filePath),
    `drive_backup_${doc.id}`,
    pages.map(p => parsePageOcrBlocks(p.ocrBlocks)),
  );
  try {
    const fileId = await uploadFileToDrive(
      pdfPath,
      `${doc.name}.pdf`,
      'application/pdf',
      doc.driveFileId,
    );
    await setDocumentDriveSync(doc.id, fileId);
  } finally {
    RNFS.unlink(pdfPath).catch(() => undefined);
  }
}

/** Backs up every document (across all folders) to Drive, one at a time.
 * Keeps going on a per-document failure so one bad document doesn't block
 * the rest, and reports a summary at the end. */
export async function backupAllDocumentsToDrive(
  onProgress?: (progress: BackupProgress) => void,
): Promise<BackupSummary> {
  const docs = await listDocuments('all');
  const summary: BackupSummary = {succeeded: 0, failed: 0, errors: []};

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    onProgress?.({current: i + 1, total: docs.length, documentName: doc.name});
    try {
      await backupDocumentToDrive(doc);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      summary.errors.push({
        documentName: doc.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
