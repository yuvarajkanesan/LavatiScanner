import RNFS from 'react-native-fs';
import { generateId } from '../utils/ids';
import { FILTER_PREVIEW_CACHE_DIR, compressImage } from './nativeImageFilter';

/** JPEG quality used when a page is permanently saved (see `persistPageImage`
 * below). Camera captures and filter-baked pages can come in anywhere from
 * ~90 up to 97+ quality at full sensor resolution - multiple MB per page for
 * content (scanned text/documents) that compresses losslessly-to-the-eye far
 * smaller. 90 is the standard "visually lossless" JPEG ceiling: re-encoding
 * at this quality measurably shrinks the file but no artifact is visible at
 * normal viewing/zoom levels, even on text. */
const SAVE_QUALITY = 90;

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
 * into permanent per-document storage - re-encoding it at `SAVE_QUALITY`
 * along the way (instead of a plain byte copy) so every page that becomes
 * part of a saved document is compressed, not just the ones that happened
 * to pass through a filter bake first (e.g. the "Original" filter, and the
 * ID Card flow, previously reached this as a raw, uncompressed copy).
 */
export async function persistPageImage(
  docId: string,
  sourceUri: string,
): Promise<string> {
  await ensureDocDir(docId);
  const cleanSource = sourceUri.replace('file://', '');
  const destination = `${docDir(docId)}/page_${generateId()}.jpg`;
  try {
    await compressImage(cleanSource, destination, SAVE_QUALITY);
  } catch (error) {
    // Best-effort - fall back to a plain copy rather than losing the page.
    await RNFS.copyFile(cleanSource, destination);
  }
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
  // One native readDir call per document folder, run concurrently rather
  // than awaited one at a time in a loop - with many documents the serial
  // version turned into a long chain of bridge round-trips (visible as the
  // whole screen's loading spinner hanging), even though none of the actual
  // disk I/O depends on any other folder's result.
  const docFolders = await RNFS.readDir(SCANS_ROOT);
  const perFolderTotals = await Promise.all(
    docFolders
      .filter(folder => folder.isDirectory())
      .map(async folder => {
        const files = await RNFS.readDir(folder.path);
        return files.reduce((sum, f) => sum + (f.size || 0), 0);
      }),
  );
  let total = perFolderTotals.reduce((sum, t) => sum + t, 0);
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
  // The filter-preview/thumbnail cache (`getThumbnail`, `renderFilterPreview`
  // in nativeImageFilter.ts) never prunes itself - this is the only user
  // lever to reclaim it. Both are fully regenerable on demand, so clearing
  // them is always safe.
  const previewCacheExists = await RNFS.exists(FILTER_PREVIEW_CACHE_DIR);
  if (previewCacheExists) {
    await RNFS.unlink(FILTER_PREVIEW_CACHE_DIR);
  }
}
