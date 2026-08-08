import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
}

interface ScanSessionContextValue extends ScanSessionState {
  startSession: (folderId?: string | null) => void;
  startAppendSession: (docId: string) => void;
  addPage: (rawUri: string) => string;
  setPageFilter: (pageId: string, filter: FilterType) => void;
  updatePage: (pageId: string, updates: Partial<Pick<SessionPage, 'rawUri' | 'filter'>>) => void;
  removePage: (pageId: string) => void;
  setDocName: (name: string) => void;
  reset: () => void;
}

const ScanSessionContext = createContext<ScanSessionContextValue | undefined>(
  undefined,
);

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [docName, setDocNameState] = useState(scanTimestampName());
  const [folderId, setFolderId] = useState<string | null>(null);
  const [pages, setPages] = useState<SessionPage[]>([]);
  const [targetDocId, setTargetDocId] = useState<string | null>(null);

  const startSession = useCallback((initialFolderId: string | null = null) => {
    setDocNameState(scanTimestampName());
    setFolderId(initialFolderId);
    setTargetDocId(null);
    setPages([]);
  }, []);

  const startAppendSession = useCallback((docId: string) => {
    setTargetDocId(docId);
    setFolderId(null);
    setPages([]);
  }, []);

  const addPage = useCallback((rawUri: string) => {
    const id = generateId();
    setPages(prev => [...prev, { id, rawUri, filter: 'original' }]);
    return id;
  }, []);

  const setPageFilter = useCallback((pageId: string, filter: FilterType) => {
    setPages(prev =>
      prev.map(p => (p.id === pageId ? { ...p, filter } : p)),
    );
  }, []);

  const updatePage = useCallback(
    (pageId: string, updates: Partial<Pick<SessionPage, 'rawUri' | 'filter'>>) => {
      setPages(prev =>
        prev.map(p => (p.id === pageId ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  const removePage = useCallback((pageId: string) => {
    setPages(prev => prev.filter(p => p.id !== pageId));
  }, []);

  const setDocName = useCallback((name: string) => setDocNameState(name), []);

  const reset = useCallback(() => {
    setDocNameState(scanTimestampName());
    setFolderId(null);
    setTargetDocId(null);
    setPages([]);
  }, []);

  const value = useMemo<ScanSessionContextValue>(
    () => ({
      docName,
      folderId,
      pages,
      targetDocId,
      startSession,
      startAppendSession,
      addPage,
      setPageFilter,
      updatePage,
      removePage,
      setDocName,
      reset,
    }),
    [
      docName,
      folderId,
      pages,
      targetDocId,
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
