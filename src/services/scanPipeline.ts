import { createDocument, addPage as addPageRecord } from '../db/database';
import { persistPageImage } from './fileStorage';
import { SessionPage } from '../context/ScanSessionContext';

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

  for (const page of session.pages) {
    const finalPath = await persistPageImage(doc.id, page.rawUri);
    await addPageRecord(doc.id, finalPath);
  }

  return doc.id;
}

/** Appends session pages to an already-existing document (the "Add page" flow from Document Detail). */
export async function appendSessionToDocument(
  docId: string,
  pages: SessionPage[],
): Promise<void> {
  for (const page of pages) {
    const finalPath = await persistPageImage(docId, page.rawUri);
    await addPageRecord(docId, finalPath);
  }
}
