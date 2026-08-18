import SQLite, {SQLiteDatabase, ResultSet} from 'react-native-sqlite-storage';
import RNFS from 'react-native-fs';
import {generateId} from '../utils/ids';
import {Document, DocumentSummary, Folder, Page} from '../types/models';

SQLite.enablePromise(true);

const DB_NAME = 'lavati_scanner.db';

let dbInstance: SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await SQLite.openDatabase({
    name: DB_NAME,
    location: 'default',
  });

  await dbInstance.executeSql(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      isLocked INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
  `);

  await dbInstance.executeSql(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      folderId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
    );
  `);

  await dbInstance.executeSql(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY NOT NULL,
      docId TEXT NOT NULL,
      pageIndex INTEGER NOT NULL,
      filePath TEXT NOT NULL,
      ocrText TEXT,
      ocrBlocks TEXT,
      pageName TEXT,
      note TEXT,
      fileSize INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (docId) REFERENCES documents(id) ON DELETE CASCADE
    );
  `);

  await dbInstance.executeSql(
    'CREATE INDEX IF NOT EXISTS idx_pages_docId ON pages(docId);',
  );
  await dbInstance.executeSql(
    'CREATE INDEX IF NOT EXISTS idx_documents_folderId ON documents(folderId);',
  );

  // Installs that already have a `pages` table from before pageName/note
  // existed won't get them from CREATE TABLE IF NOT EXISTS above, so add
  // them here. SQLite has no "ADD COLUMN IF NOT EXISTS" - detect via
  // table_info and skip if already present.
  const [tableInfo] = await dbInstance.executeSql('PRAGMA table_info(pages);');
  const existingColumns = rowsToArray<{name: string}>(tableInfo).map(
    c => c.name,
  );
  if (!existingColumns.includes('pageName')) {
    await dbInstance.executeSql('ALTER TABLE pages ADD COLUMN pageName TEXT;');
  }
  if (!existingColumns.includes('note')) {
    await dbInstance.executeSql('ALTER TABLE pages ADD COLUMN note TEXT;');
  }
  if (!existingColumns.includes('ocrBlocks')) {
    await dbInstance.executeSql(
      'ALTER TABLE pages ADD COLUMN ocrBlocks TEXT;',
    );
  }
  if (!existingColumns.includes('fileSize')) {
    await dbInstance.executeSql(
      'ALTER TABLE pages ADD COLUMN fileSize INTEGER;',
    );
  }
  await backfillMissingFileSizes(dbInstance);

  return dbInstance;
}

/** One-time backfill for pages saved before the `fileSize` column existed,
 * so existing documents show a real size instead of "0 B". Cheap/idempotent
 * — only touches rows still NULL, silently skips files that no longer exist. */
async function backfillMissingFileSizes(db: SQLiteDatabase): Promise<void> {
  const [result] = await db.executeSql(
    'SELECT id, filePath FROM pages WHERE fileSize IS NULL;',
  );
  const pending = rowsToArray<{id: string; filePath: string}>(result);
  for (const page of pending) {
    try {
      const stat = await RNFS.stat(page.filePath);
      await db.executeSql('UPDATE pages SET fileSize = ? WHERE id = ?;', [
        Number(stat.size),
        page.id,
      ]);
    } catch {
      // File missing/unreadable - leave fileSize NULL, treated as 0 in sums.
    }
  }
}

function rowsToArray<T>(result: ResultSet): T[] {
  const items: T[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    items.push(result.rows.item(i));
  }
  return items;
}

// ---------- Documents ----------

export async function createDocument(
  name: string,
  folderId: string | null = null,
): Promise<Document> {
  const db = await getDatabase();
  const now = Date.now();
  const doc: Document = {
    id: generateId(),
    name,
    folderId,
    createdAt: now,
    updatedAt: now,
  };
  await db.executeSql(
    'INSERT INTO documents (id, name, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);',
    [doc.id, doc.name, doc.folderId, doc.createdAt, doc.updatedAt],
  );
  return doc;
}

export async function renameDocument(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(
    'UPDATE documents SET name = ?, updatedAt = ? WHERE id = ?;',
    [name, Date.now(), id],
  );
}

export async function moveDocumentToFolder(
  id: string,
  folderId: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(
    'UPDATE documents SET folderId = ?, updatedAt = ? WHERE id = ?;',
    [folderId, Date.now(), id],
  );
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('DELETE FROM pages WHERE docId = ?;', [id]);
  await db.executeSql('DELETE FROM documents WHERE id = ?;', [id]);
}

export async function touchDocument(id: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE documents SET updatedAt = ? WHERE id = ?;', [
    Date.now(),
    id,
  ]);
}

export async function getDocument(id: string): Promise<Document | null> {
  const db = await getDatabase();
  const [result] = await db.executeSql(
    'SELECT * FROM documents WHERE id = ?;',
    [id],
  );
  const rows = rowsToArray<Document>(result);
  return rows[0] ?? null;
}

export async function listDocuments(
  folderId: string | null | 'all' = 'all',
): Promise<DocumentSummary[]> {
  const db = await getDatabase();
  const whereClause =
    folderId === 'all'
      ? ''
      : folderId === null
      ? 'WHERE d.folderId IS NULL'
      : 'WHERE d.folderId = ?';
  const params = folderId === 'all' || folderId === null ? [] : [folderId];

  const [result] = await db.executeSql(
    `SELECT d.*,
       (SELECT COUNT(*) FROM pages p WHERE p.docId = d.id) AS pageCount,
       (SELECT p.filePath FROM pages p WHERE p.docId = d.id ORDER BY p.pageIndex ASC LIMIT 1) AS thumbnailPath,
       (SELECT COALESCE(SUM(p.fileSize), 0) FROM pages p WHERE p.docId = d.id) AS totalSizeBytes
     FROM documents d
     ${whereClause}
     ORDER BY d.updatedAt DESC;`,
    params,
  );
  return rowsToArray<DocumentSummary>(result);
}

/** Documents that have at least one page whose OCR'd text contains `query`
 * (case-insensitive substring match). Content-only — callers that also want
 * name matches (e.g. HomeScreen's search bar) union this with their own
 * in-memory name filter. */
export async function searchDocumentsByText(
  query: string,
): Promise<DocumentSummary[]> {
  const db = await getDatabase();
  const [result] = await db.executeSql(
    `SELECT DISTINCT d.*,
       (SELECT COUNT(*) FROM pages p2 WHERE p2.docId = d.id) AS pageCount,
       (SELECT p2.filePath FROM pages p2 WHERE p2.docId = d.id ORDER BY p2.pageIndex ASC LIMIT 1) AS thumbnailPath,
       (SELECT COALESCE(SUM(p2.fileSize), 0) FROM pages p2 WHERE p2.docId = d.id) AS totalSizeBytes
     FROM documents d
     JOIN pages p ON p.docId = d.id
     WHERE p.ocrText LIKE ?
     ORDER BY d.updatedAt DESC;`,
    [`%${query}%`],
  );
  return rowsToArray<DocumentSummary>(result);
}

// ---------- Pages ----------

export async function addPage(
  docId: string,
  filePath: string,
  pageIndex?: number,
): Promise<Page> {
  const db = await getDatabase();
  let index = pageIndex;
  if (index === undefined) {
    const [countResult] = await db.executeSql(
      'SELECT COUNT(*) as count FROM pages WHERE docId = ?;',
      [docId],
    );
    index = Number(countResult.rows.item(0).count);
  }
  let fileSize: number | null = null;
  try {
    const stat = await RNFS.stat(filePath);
    fileSize = Number(stat.size);
  } catch {
    fileSize = null;
  }
  const page: Page = {
    id: generateId(),
    docId,
    pageIndex: index,
    filePath,
    ocrText: null,
    ocrBlocks: null,
    pageName: null,
    note: null,
    createdAt: Date.now(),
  };
  await db.executeSql(
    'INSERT INTO pages (id, docId, pageIndex, filePath, ocrText, pageName, note, fileSize, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
    [
      page.id,
      page.docId,
      page.pageIndex,
      page.filePath,
      page.ocrText,
      page.pageName,
      page.note,
      fileSize,
      page.createdAt,
    ],
  );
  await touchDocument(docId);
  return page;
}

export async function setPageName(
  id: string,
  pageName: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE pages SET pageName = ? WHERE id = ?;', [
    pageName,
    id,
  ]);
}

export async function setPageNote(
  id: string,
  note: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE pages SET note = ? WHERE id = ?;', [note, id]);
}

export async function listPages(docId: string): Promise<Page[]> {
  const db = await getDatabase();
  const [result] = await db.executeSql(
    'SELECT * FROM pages WHERE docId = ? ORDER BY pageIndex ASC;',
    [docId],
  );
  return rowsToArray<Page>(result);
}

export async function deletePage(id: string, docId: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('DELETE FROM pages WHERE id = ?;', [id]);
  await reindexPages(docId);
  await touchDocument(docId);
}

export async function reorderPages(
  docId: string,
  orderedPageIds: string[],
): Promise<void> {
  const db = await getDatabase();
  await db.transaction(async tx => {
    for (let i = 0; i < orderedPageIds.length; i++) {
      await tx.executeSql('UPDATE pages SET pageIndex = ? WHERE id = ?;', [
        i,
        orderedPageIds[i],
      ]);
    }
  });
  await touchDocument(docId);
}

export async function setPageFilePath(
  id: string,
  filePath: string,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE pages SET filePath = ? WHERE id = ?;', [
    filePath,
    id,
  ]);
}

export async function setPageOcrText(id: string, text: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE pages SET ocrText = ? WHERE id = ?;', [text, id]);
}

/** `blocksJson` is a JSON-serialized array of ratio-space OCR blocks (see
 * `OcrBlockRatio` in services/scanPipeline.ts) — used to place an invisible
 * searchable-text layer over each page's image when exporting a PDF. */
export async function setPageOcrBlocks(
  id: string,
  blocksJson: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE pages SET ocrBlocks = ? WHERE id = ?;', [
    blocksJson,
    id,
  ]);
}

async function reindexPages(docId: string): Promise<void> {
  const db = await getDatabase();
  const pages = await listPages(docId);
  await db.transaction(async tx => {
    for (let i = 0; i < pages.length; i++) {
      await tx.executeSql('UPDATE pages SET pageIndex = ? WHERE id = ?;', [
        i,
        pages[i].id,
      ]);
    }
  });
}

// ---------- Folders ----------

export async function createFolder(name: string): Promise<Folder> {
  const db = await getDatabase();
  const folder: Folder = {
    id: generateId(),
    name,
    isLocked: false,
    createdAt: Date.now(),
  };
  await db.executeSql(
    'INSERT INTO folders (id, name, isLocked, createdAt) VALUES (?, ?, ?, ?);',
    [folder.id, folder.name, folder.isLocked ? 1 : 0, folder.createdAt],
  );
  return folder;
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDatabase();
  const [result] = await db.executeSql(
    'SELECT * FROM folders ORDER BY createdAt ASC;',
  );
  return rowsToArray<any>(result).map(row => ({
    ...row,
    isLocked: !!row.isLocked,
  }));
}

export async function listFoldersWithDocCounts(): Promise<
  (Folder & {docCount: number})[]
> {
  const db = await getDatabase();
  const [result] = await db.executeSql(`
    SELECT f.*, (SELECT COUNT(*) FROM documents d WHERE d.folderId = f.id) AS docCount
    FROM folders f
    ORDER BY f.createdAt ASC;
  `);
  return rowsToArray<any>(result).map(row => ({
    ...row,
    isLocked: !!row.isLocked,
  }));
}

export async function setFolderLocked(
  id: string,
  isLocked: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE folders SET isLocked = ? WHERE id = ?;', [
    isLocked ? 1 : 0,
    id,
  ]);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE folders SET name = ? WHERE id = ?;', [name, id]);
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(
    'UPDATE documents SET folderId = NULL WHERE folderId = ?;',
    [id],
  );
  await db.executeSql('DELETE FROM folders WHERE id = ?;', [id]);
}
