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
  try {
    require('./syncStatus').forgetSyncDocument(docId);
  } catch {
    // status store unavailable - nothing to clear
  }
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
    // Auto backup off, offline, or Wi-Fi-only on mobile data: leave the
    // document pending (its icon shows waiting/paused). It uploads on the
    // next "Sync now" or, if auto backup is on, when connectivity returns.
    const {getSyncSnapshot, getSyncBlockReason} = require('./syncStatus');
    const snap = getSyncSnapshot();
    if (!snap.settings.autoBackup || getSyncBlockReason(snap)) {
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

let watcherStarted = false;

/** Resumes uploads of anything still pending once the phone is allowed to
 * sync again (back online, or onto Wi-Fi under "Wi-Fi only"). Call once at
 * startup; also loads saved preferences and starts connectivity tracking. */
export function startSyncWatcher(): void {
  if (watcherStarted) {
    return;
  }
  watcherStarted = true;
  const {
    initSyncStatus,
    subscribeSyncStatus,
    getSyncSnapshot,
    getSyncBlockReason,
  } = require('./syncStatus');
  initSyncStatus();

  let wasBlocked = getSyncBlockReason(getSyncSnapshot()) !== null;
  subscribeSyncStatus(() => {
    const snap = getSyncSnapshot();
    const blocked = getSyncBlockReason(snap) !== null;
    if (wasBlocked && !blocked && snap.settings.autoBackup) {
      resumePendingSync();
    }
    wasBlocked = blocked;
  });
}

async function resumePendingSync(): Promise<void> {
  try {
    const {isGoogleDriveSignedIn} = require('./googleDrive');
    if (!isGoogleDriveSignedIn()) {
      return;
    }
    const {backupAllDocumentsToDrive} = require('./driveBackup');
    await backupAllDocumentsToDrive();
  } catch {
    // Best-effort, same as the debounced per-document sync.
  }
}
