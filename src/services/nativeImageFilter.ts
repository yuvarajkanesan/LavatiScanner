import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import {FilterType} from '../types/models';

const {ImageFilterModule} = NativeModules;

/** Exported so `fileStorage.clearCaches` can reclaim it too - this
 * directory only ever grows (every unique source-file+filter/thumbnail
 * combination gets its own cached file, never pruned as pages are edited or
 * documents deleted), so without a way to clear it users would have no
 * recourse but to uninstall or wait for the OS to evict it under storage
 * pressure. */
export const FILTER_PREVIEW_CACHE_DIR = `${RNFS.CachesDirectoryPath}/filter-preview`;
const CACHE_DIR = FILTER_PREVIEW_CACHE_DIR;
let cacheDirReady: Promise<void> | null = null;

async function ensureCacheDir(): Promise<void> {
  if (!cacheDirReady) {
    cacheDirReady = (async () => {
      const exists = await RNFS.exists(CACHE_DIR);
      if (!exists) {
        await RNFS.mkdir(CACHE_DIR);
      }
    })();
  }
  return cacheDirReady;
}


/**
 * Turns an image URI into a plain filesystem path the native module can open.
 * URIs coming from `Uri.fromFile(...)` (e.g. react-native-pdf-thumbnail's page
 * renders) are URL-encoded - a space becomes `%20` - but the native side opens
 * the path literally, so an encoded path fails with ENOENT and the filter
 * silently falls back to the unfiltered image. Only decodes when the literal
 * path doesn't exist, so real filenames containing '%' keep working.
 */
async function resolveLocalPath(uri: string): Promise<string> {
  const stripped = uri.replace('file://', '');
  if (!/%[0-9A-Fa-f]{2}/.test(stripped)) {
    return stripped;
  }
  if (await RNFS.exists(stripped)) {
    return stripped;
  }
  try {
    const decoded = decodeURIComponent(stripped);
    if (await RNFS.exists(decoded)) {
      return decoded;
    }
  } catch {
    // malformed escape sequence - fall through to the literal path
  }
  return stripped;
}

/** Cheap non-cryptographic string hash, good enough for a cache filename. */
function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 2147483647;
  }
  return h.toString(36);
}

/**
 * Renders `filter` onto the image at `sourceUri` using the native
 * Bitmap/Canvas module (always software - never a hardware View layer) and
 * returns a file:// URI to the result. 'original' resolves to the source
 * unchanged. Results are cached on disk by (source, filter) so re-selecting
 * a filter or re-rendering the filmstrip doesn't re-bake every time.
 */
export async function renderFilterPreview(
  sourceUri: string,
  filter: FilterType,
  maxDimension: number = PREVIEW_MAX_DIMENSION,
): Promise<string> {
  if (filter === 'original') {
    return sourceUri;
  }

  await ensureCacheDir();
  const cleanSource = await resolveLocalPath(sourceUri);
  // Default-size previews keep their original cache key so existing cached
  // files stay valid; larger renders get their own entry.
  const cacheKey =
    maxDimension === PREVIEW_MAX_DIMENSION
      ? `${cleanSource}:${filter}`
      : `${cleanSource}:${filter}:${maxDimension}`;
  const outputPath = `${CACHE_DIR}/${hash(cacheKey)}.jpg`;

  const exists = await RNFS.exists(outputPath);
  if (exists) {
    return `file://${outputPath}`;
  }

  const resultPath = await ImageFilterModule.applyScanFilter(
    cleanSource,
    outputPath,
    filter,
    92,
    maxDimension,
  );
  return `file://${resultPath}`;
}

/** Preview thumbnails (filmstrip + per-page strip) never need more pixels
 * than they'll ever be displayed at - decoding them at full sensor
 * resolution is what was blowing the native heap once a few concurrent
 * previews piled up. */
const PREVIEW_MAX_DIMENSION = 640;

/** Bakes a filter to a specific destination path (for permanently saving a page). */
export async function bakeFilterToFile(
  sourceUri: string,
  filter: FilterType,
  outputPath: string,
  quality: number = 97,
): Promise<string> {
  const cleanSource = await resolveLocalPath(sourceUri);
  if (filter === 'original') {
    await RNFS.copyFile(cleanSource, outputPath);
    return outputPath;
  }
  return ImageFilterModule.applyScanFilter(
    cleanSource,
    outputPath,
    filter,
    quality,
    0,
  );
}

const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
];

/**
 * Re-encodes an image at a lower JPEG quality via the native decode/redraw
 * path (an identity color matrix - no visual change, just recompression).
 */
export async function compressImage(
  sourceUri: string,
  outputPath: string,
  quality: number,
): Promise<string> {
  const cleanSource = await resolveLocalPath(sourceUri);
  return ImageFilterModule.applyColorMatrix(
    cleanSource,
    outputPath,
    IDENTITY_MATRIX,
    quality,
    0,
    0,
  );
}

/** Small quality for `getThumbnail` output - it's only ever shown at a few
 * hundred pixels (document list cards/rows, page grid), so a lower JPEG
 * quality is invisible there and keeps the cached files tiny. */
const THUMBNAIL_QUALITY = 80;

/**
 * Cached, downsized (max `PREVIEW_MAX_DIMENSION`) copy of a page image for
 * use as a thumbnail - document list cards/rows, the document's page grid.
 * This is the same fix already applied to the filmstrip/preview strip
 * (`renderFilterPreview`, above): those UIs only ever show a few hundred
 * pixels, but without this, RN/Android decodes the full sensor-resolution
 * scan just to shrink it down, and doing that for every visible row in a
 * scrolling list is what makes the whole app feel sluggish - list scroll,
 * and indirectly everything else via the GC pressure it creates. Cached by
 * a hash of the source path, so repeat renders (re-scrolling, revisiting a
 * screen) are a disk-exists check, not a re-decode. Safe to cache
 * indefinitely: every edit (crop/rotate/filter) writes its result to a new
 * file path (`persistPageImage`), never overwrites one in place.
 */
export async function getThumbnail(sourcePath: string): Promise<string> {
  await ensureCacheDir();
  const cleanSource = await resolveLocalPath(sourcePath);
  const outputPath = `${CACHE_DIR}/${hash(`${cleanSource}:thumb`)}.jpg`;

  const exists = await RNFS.exists(outputPath);
  if (exists) {
    return `file://${outputPath}`;
  }

  const resultPath = await ImageFilterModule.applyColorMatrix(
    cleanSource,
    outputPath,
    IDENTITY_MATRIX,
    THUMBNAIL_QUALITY,
    0,
    PREVIEW_MAX_DIMENSION,
  );
  return `file://${resultPath}`;
}

/**
 * Crops `sourceUri` to a ratio-based region (0..1 of the upright image,
 * same convention as `detectDocumentCorners`/`warpPerspective`) and writes
 * the result to `outputPath`. Used for the live-camera frame guide (e.g.
 * ID Card mode) instead of the PDF-based `cropImageFile` in pdfExport.ts,
 * because that path reads the JPEG's raw (EXIF-ignorant) pixel buffer -
 * fine for crop shapes a user drew on the already-upright preview image,
 * but wrong for ratios computed against a fresh camera capture, which is
 * stored sensor-landscape and only appears upright via EXIF rotation.
 */
export async function cropRegion(
  sourceUri: string,
  outputPath: string,
  xRatio: number,
  yRatio: number,
  widthRatio: number,
  heightRatio: number,
  quality: number = 92,
): Promise<string> {
  const cleanSource = await resolveLocalPath(sourceUri);
  const resultPath = await ImageFilterModule.cropRegion(
    cleanSource,
    outputPath,
    xRatio,
    yRatio,
    widthRatio,
    heightRatio,
    quality,
  );
  return `file://${resultPath}`;
}

export interface QuadCorners {
  topLeft: {x: number; y: number};
  topRight: {x: number; y: number};
  bottomRight: {x: number; y: number};
  bottomLeft: {x: number; y: number};
}

/**
 * Finds the page/book in a photo and returns its four corners as 0..1
 * fractions of the (upright) image, or null when nothing document-like
 * stands out - the caller then keeps its default full-frame crop.
 */
export async function detectDocumentCorners(
  sourceUri: string,
): Promise<QuadCorners | null> {
  const cleanSource = await resolveLocalPath(sourceUri);
  const flat: number[] | null = await ImageFilterModule.detectDocumentCorners(
    cleanSource,
  );
  if (!flat || flat.length !== 8) {
    return null;
  }
  return {
    topLeft: {x: flat[0], y: flat[1]},
    topRight: {x: flat[2], y: flat[3]},
    bottomRight: {x: flat[4], y: flat[5]},
    bottomLeft: {x: flat[6], y: flat[7]},
  };
}

/**
 * Straightens a document photographed at an angle: warps the quadrilateral
 * given by `corners` (in the source image's own pixel space, top-left
 * origin) onto a clean rectangle via the native `warpPerspective` module
 * (Android's `Matrix.setPolyToPoly`), and writes the result to `outputPath`.
 */
export async function warpPerspective(
  sourceUri: string,
  corners: QuadCorners,
  outputPath: string,
  quality: number = 92,
): Promise<string> {
  const cleanSource = await resolveLocalPath(sourceUri);
  const flatCorners = [
    corners.topLeft.x,
    corners.topLeft.y,
    corners.topRight.x,
    corners.topRight.y,
    corners.bottomRight.x,
    corners.bottomRight.y,
    corners.bottomLeft.x,
    corners.bottomLeft.y,
  ];
  return ImageFilterModule.warpPerspective(
    cleanSource,
    outputPath,
    flatCorners,
    quality,
  );
}

const PREVIEW_CACHE_MAX_BYTES = 40 * 1024 * 1024;
const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TEMP_FILE_PATTERN = /(pdfpage_hd_|-thumbnail-|pdf_edit_|drive_restore_)/;

/**
 * Keeps the cache from growing without bound. Filter previews are cheap to
 * regenerate, so the oldest are dropped once the folder passes ~40 MB; the
 * temporary page renders the PDF editor leaves in the cache root are deleted
 * after a day. Best-effort and run once at startup - it never throws.
 */
export async function pruneCaches(): Promise<void> {
  try {
    if (await RNFS.exists(CACHE_DIR)) {
      const files = (await RNFS.readDir(CACHE_DIR)).filter(f => f.isFile());
      let total = files.reduce((sum, f) => sum + Number(f.size), 0);
      if (total > PREVIEW_CACHE_MAX_BYTES) {
        const oldestFirst = [...files].sort(
          (a, b) => (a.mtime?.getTime() ?? 0) - (b.mtime?.getTime() ?? 0),
        );
        for (const file of oldestFirst) {
          if (total <= PREVIEW_CACHE_MAX_BYTES) {
            break;
          }
          await RNFS.unlink(file.path).catch(() => undefined);
          total -= Number(file.size);
        }
      }
    }

    const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;
    const rootFiles = await RNFS.readDir(RNFS.CachesDirectoryPath);
    for (const file of rootFiles) {
      if (
        file.isFile() &&
        TEMP_FILE_PATTERN.test(file.name) &&
        (file.mtime?.getTime() ?? Date.now()) < cutoff
      ) {
        await RNFS.unlink(file.path).catch(() => undefined);
      }
    }
  } catch {
    // Pruning is housekeeping only.
  }
}
