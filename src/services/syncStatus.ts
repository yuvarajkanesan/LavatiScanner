import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type {Document} from '../types/models';

/**
 * Shared, observable state for Google Drive sync: the user's two sync
 * preferences (persisted), live connectivity, and what the sync engine is
 * doing right now. The header sync icon, the sync sheet and every document
 * row's status icon read from this one place, so they can never disagree.
 *
 * Deliberately imports nothing from the sync engine (`driveBackup`,
 * `syncScheduler`) - those import *this* module to report progress, and
 * `database.ts` imports the scheduler, so a back-reference would be circular.
 */

export type SyncState = 'synced' | 'syncing' | 'waiting' | 'paused' | 'failed';

export interface SyncSettings {
  /** Upload changes automatically a few seconds after each edit. */
  autoBackup: boolean;
  /** Only upload while connected to Wi-Fi (never on mobile data). */
  wifiOnly: boolean;
}

export interface SyncSnapshot {
  settings: SyncSettings;
  online: boolean;
  onWifi: boolean;
  /** Document ids with an upload in flight right now. */
  syncingIds: string[];
  /** Document id -> last error message, for uploads that failed. */
  failed: Record<string, string>;
  /** Progress of a multi-document pass ("Syncing 3 of 12 files"). */
  progress: {current: number; total: number} | null;
  lastSyncedAt: number | null;
}

const SETTINGS_KEY = 'drive_sync_settings_v1';
const LAST_SYNCED_KEY = 'drive_last_synced_v1';

let snapshot: SyncSnapshot = {
  settings: {autoBackup: true, wifiOnly: true},
  online: true,
  onWifi: true,
  syncingIds: [],
  failed: {},
  progress: null,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();

function update(patch: Partial<SyncSnapshot>): void {
  snapshot = {...snapshot, ...patch};
  listeners.forEach(l => l());
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

/** Re-renders the calling component whenever sync state changes. */
export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(subscribeSyncStatus, getSyncSnapshot);
}

// ── Persistence + connectivity ───────────────────────────────────────────

let initialized = false;

/** Loads saved preferences and starts tracking connectivity. Safe to call
 * from several places - only the first call does any work. */
export function initSyncStatus(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  AsyncStorage.getItem(SETTINGS_KEY)
    .then(raw => {
      if (raw) {
        const parsed = JSON.parse(raw);
        update({
          settings: {
            autoBackup: parsed.autoBackup !== false,
            wifiOnly: parsed.wifiOnly !== false,
          },
        });
      }
    })
    .catch(() => undefined);
  AsyncStorage.getItem(LAST_SYNCED_KEY)
    .then(raw => {
      const value = raw ? Number(raw) : NaN;
      if (Number.isFinite(value)) {
        update({lastSyncedAt: value});
      }
    })
    .catch(() => undefined);

  NetInfo.addEventListener(state => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    const onWifi = state.type === 'wifi' || state.type === 'ethernet';
    if (online !== snapshot.online || onWifi !== snapshot.onWifi) {
      update({online, onWifi});
    }
  });
}

export function setSyncSettings(patch: Partial<SyncSettings>): void {
  const settings = {...snapshot.settings, ...patch};
  update({settings});
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(
    () => undefined,
  );
}

// ── Reporting from the sync engine ───────────────────────────────────────

function withoutKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  const copy = {...record};
  delete copy[key];
  return copy;
}

export function markSyncStarted(docId: string): void {
  if (snapshot.syncingIds.includes(docId)) {
    return;
  }
  update({
    syncingIds: [...snapshot.syncingIds, docId],
    failed: withoutKey(snapshot.failed, docId),
  });
}

export function markSyncSucceeded(docId: string): void {
  const now = Date.now();
  update({
    syncingIds: snapshot.syncingIds.filter(id => id !== docId),
    lastSyncedAt: now,
  });
  AsyncStorage.setItem(LAST_SYNCED_KEY, String(now)).catch(() => undefined);
}

export function markSyncFailed(docId: string, message: string): void {
  update({
    syncingIds: snapshot.syncingIds.filter(id => id !== docId),
    failed: {...snapshot.failed, [docId]: message},
  });
}

/** Forget a document's state entirely (it was deleted). */
export function forgetSyncDocument(docId: string): void {
  update({
    syncingIds: snapshot.syncingIds.filter(id => id !== docId),
    failed: withoutKey(snapshot.failed, docId),
  });
}

export function setSyncProgress(
  progress: {current: number; total: number} | null,
): void {
  update({progress});
}

// ── Derived state ────────────────────────────────────────────────────────

export type SyncBlockReason = 'offline' | 'wifi-only' | null;

/** Why uploads can't run right now, or null when they can. */
export function getSyncBlockReason(snap: SyncSnapshot): SyncBlockReason {
  if (!snap.online) {
    return 'offline';
  }
  if (snap.settings.wifiOnly && !snap.onWifi) {
    return 'wifi-only';
  }
  return null;
}

export function isDocumentSynced(doc: Pick<Document, 'driveSyncedAt' | 'updatedAt'>): boolean {
  return doc.driveSyncedAt != null && doc.driveSyncedAt >= doc.updatedAt;
}

/** Sync state of one document that only re-renders the caller when *that
 * document's* state changes (the selector returns a primitive string), not on
 * every progress tick - a list can have dozens of rows subscribed. */
export function useDocumentSyncState(
  doc: Pick<Document, 'id' | 'driveSyncedAt' | 'updatedAt'>,
): SyncState {
  return useSyncExternalStore(subscribeSyncStatus, () =>
    getDocumentSyncState(doc, snapshot),
  );
}

/** Sync state of one document, for its row/card icon. */
export function getDocumentSyncState(
  doc: Pick<Document, 'id' | 'driveSyncedAt' | 'updatedAt'>,
  snap: SyncSnapshot,
): SyncState {
  if (snap.syncingIds.includes(doc.id)) {
    return 'syncing';
  }
  if (snap.failed[doc.id]) {
    return 'failed';
  }
  if (isDocumentSynced(doc)) {
    return 'synced';
  }
  return getSyncBlockReason(snap) ? 'paused' : 'waiting';
}

/** Overall state for the header icon. `pendingCount` is how many documents
 * still need uploading. */
export function getOverallSyncState(
  snap: SyncSnapshot,
  pendingCount: number,
): SyncState {
  if (snap.syncingIds.length > 0 || snap.progress) {
    return 'syncing';
  }
  if (Object.keys(snap.failed).length > 0) {
    return 'failed';
  }
  if (pendingCount > 0) {
    return getSyncBlockReason(snap) ? 'paused' : 'waiting';
  }
  return 'synced';
}
