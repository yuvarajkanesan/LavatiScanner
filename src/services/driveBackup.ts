import RNFS from 'react-native-fs';
import {listDocuments, listPages, setDocumentDriveSync} from '../db/database';
import {buildPdfFromImages, parsePageOcrBlocks} from './pdfExport';
import {uploadFileToDrive} from './googleDrive';
import {Document} from '../types/models';

export interface BackupProgress {
  current: number;
  total: number;
  documentName: string;
}

export interface BackupSummary {
  succeeded: number;
  failed: number;
  /** Documents that were already up to date and got skipped. */
  skipped: number;
  errors: {documentName: string; error: string}[];
}

/** A document counts as synced once it's been uploaded at least once *and*
 * nothing has changed locally since (`updatedAt` bumps on every page/name
 * edit - see `db/database.ts`). Shared by the backup pass (to decide what
 * needs uploading) and the document list UI (to render the sync badge), so
 * the two can never disagree. */
export function isDocumentSynced(doc: Document): boolean {
  return doc.driveSyncedAt != null && doc.driveSyncedAt >= doc.updatedAt;
}

/** Builds `doc`'s current PDF and uploads it to the app's Drive folder,
 * updating the existing Drive file in place if this document was backed up
 * before. Safe to call repeatedly - each call re-exports the latest pages. */
export async function backupDocumentToDrive(doc: Document): Promise<void> {
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

/** Backs up only documents that actually need it - never synced, or changed
 * since their last sync - one at a time. Documents already up to date are
 * skipped entirely (no PDF rebuild, no upload). Keeps going on a
 * per-document failure so one bad document doesn't block the rest, and
 * reports a summary at the end. */
export async function backupAllDocumentsToDrive(
  onProgress?: (progress: BackupProgress) => void,
): Promise<BackupSummary> {
  const allDocs = await listDocuments('all');
  const docs = allDocs.filter(doc => !isDocumentSynced(doc));
  const summary: BackupSummary = {
    succeeded: 0,
    failed: 0,
    skipped: allDocs.length - docs.length,
    errors: [],
  };

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
