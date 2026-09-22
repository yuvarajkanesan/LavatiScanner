/**
 * Debounced auto-sync to Google Drive. `db/database.ts` calls
 * `scheduleDocumentSync(docId)` after every page/document modification
 * (add/delete/reorder page, rename, edit a page's image, note, etc.) so
 * backups stay current without the user having to remember to press
 * "Back up now". Rapid successive edits (e.g. every page captured during a
 * multi-page scan) coalesce into a single upload a few seconds after the
 * last change, instead of uploading after every single page.
 *
 * Entirely silent when Drive isn't connected - no popup, no retry noise -
 * since most users won't have set this up. "Back up now" in Settings is
 * still the place errors get surfaced to the user.
 *
 * Uses `require()` instead of a top-level `import` for `./googleDrive`,
 * `./driveBackup` and `../db/database` because `database.ts` imports *this*
 * module to trigger the sync - a top-level circular import here would risk
 * one side seeing an undefined binding depending on load order. Deferring
 * the require until the debounce timer actually fires sidesteps that: by
 * then every module involved has finished loading.
 */

const SYNC_DEBOUNCE_MS = 4000;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDocumentSync(docId: string): void {
  const existing = pendingTimers.get(docId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    pendingTimers.delete(docId);
    runSync(docId);
  }, SYNC_DEBOUNCE_MS);
  pendingTimers.set(docId, timer);
}

/** Cancels a pending debounced sync for a document - used right before
 * deleting it, so a delayed upload can't re-create it in Drive after the
 * local delete (and Drive-side delete) already ran. */
export function cancelScheduledSync(docId: string): void {
  const existing = pendingTimers.get(docId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(docId);
  }
}

async function runSync(docId: string): Promise<void> {
  try {
    const {isGoogleDriveSignedIn} = require('./googleDrive');
    if (!isGoogleDriveSignedIn()) {
      return;
    }
    const {getDocument} = require('../db/database');
    const {backupDocumentToDrive} = require('./driveBackup');
    const doc = await getDocument(docId);
    if (doc) {
      await backupDocumentToDrive(doc);
    }
  } catch {
    // Best-effort background sync - offline, expired token, etc. shouldn't
    // surface as an error the user didn't ask for.
  }
}

/** Best-effort delete of a document's backed-up file from Drive, fired when
 * the document itself is deleted locally. Fire-and-forget: the caller
 * doesn't wait on Drive to finish the local delete. */
export function scheduleDriveDelete(driveFileId: string | null): void {
  if (!driveFileId) {
    return;
  }
  (async () => {
    try {
      const {isGoogleDriveSignedIn, deleteFileFromDrive} = require('./googleDrive');
      if (!isGoogleDriveSignedIn()) {
        return;
      }
      await deleteFileFromDrive(driveFileId);
    } catch {
      // Best-effort - if this fails the file just lingers in Drive.
    }
  })();
}
