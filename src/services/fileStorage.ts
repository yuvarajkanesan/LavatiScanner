import RNFS from 'react-native-fs';
import { generateId } from '../utils/ids';

export const SCANS_ROOT = `${RNFS.DocumentDirectoryPath}/scans`;
export const EXPORTS_ROOT = `${RNFS.DocumentDirectoryPath}/exports`;

export function docDir(docId: string): string {
  return `${SCANS_ROOT}/${docId}`;
}

export async function ensureDocDir(docId: string): Promise<string> {
  const dir = docDir(docId);
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
  return dir;
}

export async function ensureExportsDir(): Promise<string> {
  const exists = await RNFS.exists(EXPORTS_ROOT);
  if (!exists) {
    await RNFS.mkdir(EXPORTS_ROOT);
  }
  return EXPORTS_ROOT;
}

/**
 * Moves a captured/filtered page image (typically a cache-dir temp file)
 * into permanent per-document storage.
 */
export async function persistPageImage(
  docId: string,
  sourceUri: string,
): Promise<string> {
  await ensureDocDir(docId);
  const cleanSource = sourceUri.replace('file://', '');
  const destination = `${docDir(docId)}/page_${generateId()}.jpg`;
  await RNFS.copyFile(cleanSource, destination);
  // Best-effort cleanup of the temp source file.
  RNFS.unlink(cleanSource).catch(() => undefined);
  return destination;
}

/**
 * Copies an existing permanent page file into another document's storage,
 * without touching (or deleting) the source file. Used for "Copy document".
 */
export async function copyPageFile(docId: string, sourceFilePath: string): Promise<string> {
  await ensureDocDir(docId);
  const cleanSource = sourceFilePath.replace('file://', '');
  const destination = `${docDir(docId)}/page_${generateId()}.jpg`;
  await RNFS.copyFile(cleanSource, destination);
  return destination;
}

export async function deleteDocumentFiles(docId: string): Promise<void> {
  const dir = docDir(docId);
  const exists = await RNFS.exists(dir);
  if (exists) {
    await RNFS.unlink(dir);
  }
}

export async function deletePageFile(filePath: string): Promise<void> {
  const exists = await RNFS.exists(filePath);
  if (exists) {
    await RNFS.unlink(filePath);
  }
}

export async function getStorageUsageBytes(): Promise<number> {
  const exists = await RNFS.exists(SCANS_ROOT);
  if (!exists) return 0;
  let total = 0;
  const docFolders = await RNFS.readDir(SCANS_ROOT);
  for (const folder of docFolders) {
    if (folder.isDirectory()) {
      const files = await RNFS.readDir(folder.path);
      total += files.reduce((sum, f) => sum + (f.size || 0), 0);
    }
  }
  const exportsExist = await RNFS.exists(EXPORTS_ROOT);
  if (exportsExist) {
    const exportFiles = await RNFS.readDir(EXPORTS_ROOT);
    total += exportFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  }
  return total;
}

export async function clearExportsCache(): Promise<void> {
  const exists = await RNFS.exists(EXPORTS_ROOT);
  if (exists) {
    await RNFS.unlink(EXPORTS_ROOT);
  }
}
