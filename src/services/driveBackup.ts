import RNFS from 'react-native-fs';
import {
  listDocuments,
  listPages,
  setDocumentDriveSync,
  createDocument,
  addPage as addPageRecord,
} from '../db/database';
import {buildPdfFromImages, parsePageOcrBlocks} from './pdfExport';
import {
  uploadFileToDrive,
  listDriveBackups,
  downloadFileFromDrive,
  DriveBackupFile,
} from './googleDrive';
import {persistPageImage} from './fileStorage';
import {renderAllPdfPages} from './pdfThumbnail';
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

export interface RestoreProgress {
  current: number;
  total: number;
  documentName: string;
}

export interface RestoreSummary {
  succeeded: number;
  failed: number;
  /** Already present locally (matched by Drive file ID) - not re-downloaded. */
  skipped: number;
  errors: {documentName: string; error: string}[];
}

/** Downloads one Drive backup file, splits it back into page images (the
 * reverse of `backupDocumentToDrive`'s merge-into-one-PDF), and creates a
 * new local document from them. Marks the new document as already synced to
 * this exact Drive file via `setDocumentDriveSync`, so the next "Backup Now"
 * pass sees it as up to date instead of immediately re-uploading it as if it
 * were new/changed. */
export async function restoreDocumentFromDrive(
  file: DriveBackupFile,
  folderId: string | null = null,
): Promise<string> {
  const tempPdfPath = `${RNFS.CachesDirectoryPath}/drive_restore_${file.id}.pdf`;
  try {
    await downloadFileFromDrive(file.id, tempPdfPath);
    const pages = await renderAllPdfPages(tempPdfPath, 92);
    if (pages.length === 0) {
      throw new Error('Backup file has no pages');
    }
    const name = file.name.replace(/\.pdf$/i, '');
    const doc = await createDocument(name, folderId);
    for (const page of pages) {
      const finalPath = await persistPageImage(doc.id, page.uri);
      await addPageRecord(doc.id, finalPath);
    }
    await setDocumentDriveSync(doc.id, file.id);
    return doc.id;
  } finally {
    RNFS.unlink(tempPdfPath).catch(() => undefined);
  }
}

/** Restores every Drive-backed-up document that doesn't already exist
 * locally - matched by Drive file ID (not name, which a user could rename
 * either side), so this is safe to re-run: already-restored documents are
 * skipped, never duplicated. */
export async function restoreAllFromDrive(
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreSummary> {
  const [driveFiles, localDocs] = await Promise.all([
    listDriveBackups(),
    listDocuments('all'),
  ]);
  const alreadyLocal = new Set(
    localDocs.map(d => d.driveFileId).filter((id): id is string => !!id),
  );
  const toRestore = driveFiles.filter(f => !alreadyLocal.has(f.id));

  const summary: RestoreSummary = {
    succeeded: 0,
    failed: 0,
    skipped: driveFiles.length - toRestore.length,
    errors: [],
  };

  for (let i = 0; i < toRestore.length; i++) {
    const file = toRestore[i];
    onProgress?.({
      current: i + 1,
      total: toRestore.length,
      documentName: file.name,
    });
    try {
      await restoreDocumentFromDrive(file);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      summary.errors.push({
        documentName: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
