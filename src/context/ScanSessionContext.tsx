import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import RNFS from 'react-native-fs';
import { FilterType } from '../types/models';
import { scanTimestampName } from '../utils/format';
import { generateId } from '../utils/ids';

export interface SessionPage {
  id: string;
  /** URI of the raw (unfiltered) captured/cropped image, in cache storage. */
  rawUri: string;
  filter: FilterType;
}

interface ScanSessionState {
  docName: string;
  folderId: string | null;
  pages: SessionPage[];
  /** When set, "Done" appends pages to this existing document instead of creating a new one. */
  targetDocId: string | null;
  /** Whether the camera's "hold still to auto-capture" mode is on. Lives
   * here (not local Capture-screen state) so it stays on across the
   * Capture → Trim → Filter → "Add another page" loop for the whole
   * multi-page session, instead of resetting on every page. */
  autoCaptureEnabled: boolean;
}

interface ScanSessionContextValue extends ScanSessionState {
  startSession: (folderId?: string | null) => void;
  startAppendSession: (docId: string) => void;
  addPage: (rawUri: string, filter?: FilterType) => string;
  setPageFilter: (pageId: string, filter: FilterType) => void;
  updatePage: (pageId: string, updates: Partial<Pick<SessionPage, 'rawUri' | 'filter'>>) => void;
  removePage: (pageId: string) => void;
  setDocName: (name: string) => void;
  setAutoCaptureEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const ScanSessionContext = createContext<ScanSessionContextValue | undefined>(
  undefined,
);

/** Captured/cropped session pages live as temp files under
 * `RNFS.CachesDirectoryPath` (see TrimPageScreen's `trim_*.jpg` output)
 * until `persistPageImage` copies the finished page into permanent
 * document storage and unlinks the temp file. If the user instead abandons
 * a multi-page scan partway (backs out of Capture/Trim/Filter before
 * "Done"), nothing ever calls that unlink - those temp files just sit in
 * cache storage forever, and starting a new session below would drop the
 * only reference to their paths, making them unreachable garbage. This
 * deletes any pages still pointing at a temp file whenever a session is
 * discarded, so an abandoned scan doesn't leak disk space. Scoped to only
 * ever touch paths under the cache dir - even if some future bug fed a
 * permanent document path into a session page, this could never delete it. */
function cleanupOrphanedSessionPages(pages: SessionPage[]): void {
  for (const page of pages) {
    const path = page.rawUri.replace('file://', '');
    if (path.startsWith(RNFS.CachesDirectoryPath)) {
      RNFS.unlink(path).catch(() => undefined);
    }
  }
}

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [docName, setDocNameState] = useState(scanTimestampName());
  const [folderId, setFolderId] = useState<string | null>(null);
  const [pages, setPages] = useState<SessionPage[]>([]);
  const [targetDocId, setTargetDocId] = useState<string | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);

  const startSession = useCallback((initialFolderId: string | null = null) => {
    setDocNameState(scanTimestampName());
    setFolderId(initialFolderId);
    setTargetDocId(null);
    setPages(prev => {
      cleanupOrphanedSessionPages(prev);
      return [];
    });
  }, []);

  const startAppendSession = useCallback((docId: string) => {
    setTargetDocId(docId);
    setFolderId(null);
    setPages(prev => {
      cleanupOrphanedSessionPages(prev);
      return [];
    });
  }, []);

  const addPage = useCallback(
    (rawUri: string, filter: FilterType = 'original') => {
      const id = generateId();
      setPages(prev => [...prev, { id, rawUri, filter }]);
      return id;
    },
    [],
  );

  const setPageFilter = useCallback((pageId: string, filter: FilterType) => {
    setPages(prev =>
      prev.map(p => (p.id === pageId ? { ...p, filter } : p)),
    );
  }, []);

  const updatePage = useCallback(
    (pageId: string, updates: Partial<Pick<SessionPage, 'rawUri' | 'filter'>>) => {
      setPages(prev =>
        prev.map(p => {
          if (p.id !== pageId) {
            return p;
          }
          // Re-cropping/rotating/baking a filter during the session replaces
          // rawUri with a brand-new temp file each time - clean up the one
          // being replaced so a page edited several times before "Done"
          // doesn't leave every intermediate version behind in cache.
          if (updates.rawUri && updates.rawUri !== p.rawUri) {
            cleanupOrphanedSessionPages([p]);
          }
          return { ...p, ...updates };
        }),
      );
    },
    [],
  );

  const removePage = useCallback((pageId: string) => {
    setPages(prev => {
      const removed = prev.find(p => p.id === pageId);
      if (removed) {
        cleanupOrphanedSessionPages([removed]);
      }
      return prev.filter(p => p.id !== pageId);
    });
  }, []);

  const setDocName = useCallback((name: string) => setDocNameState(name), []);

  const reset = useCallback(() => {
    setDocNameState(scanTimestampName());
    setFolderId(null);
    setTargetDocId(null);
    setPages(prev => {
      cleanupOrphanedSessionPages(prev);
      return [];
    });
  }, []);

  const value = useMemo<ScanSessionContextValue>(
    () => ({
      docName,
      folderId,
      pages,
      targetDocId,
      autoCaptureEnabled,
      startSession,
      startAppendSession,
      addPage,
      setPageFilter,
      updatePage,
      removePage,
      setDocName,
      setAutoCaptureEnabled,
      reset,
    }),
    [
      docName,
      folderId,
      pages,
      targetDocId,
      autoCaptureEnabled,
      startSession,
      startAppendSession,
      addPage,
      setPageFilter,
      updatePage,
      removePage,
      setDocName,
      reset,
    ],
  );

  return (
    <ScanSessionContext.Provider value={value}>
      {children}
    </ScanSessionContext.Provider>
  );
}

export function useScanSession(): ScanSessionContextValue {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) {
    throw new Error('useScanSession must be used within a ScanSessionProvider');
  }
  return ctx;
}
