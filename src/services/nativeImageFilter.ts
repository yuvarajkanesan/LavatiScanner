import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import {FilterType} from '../types/models';
import {getFilterMatrix} from './filters';

const {ImageFilterModule} = NativeModules;

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/filter-preview`;
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
): Promise<string> {
  const matrix = getFilterMatrix(filter);
  if (!matrix) {
    return sourceUri;
  }

  await ensureCacheDir();
  const cleanSource = sourceUri.replace('file://', '');
  const outputPath = `${CACHE_DIR}/${hash(`${cleanSource}:${filter}`)}.jpg`;

  const exists = await RNFS.exists(outputPath);
  if (exists) {
    return `file://${outputPath}`;
  }

  const resultPath = await ImageFilterModule.applyColorMatrix(
    cleanSource,
    outputPath,
    matrix,
    90,
  );
  return `file://${resultPath}`;
}

/** Bakes a filter to a specific destination path (for permanently saving a page). */
export async function bakeFilterToFile(
  sourceUri: string,
  filter: FilterType,
  outputPath: string,
  quality: number = 92,
): Promise<string> {
  const matrix = getFilterMatrix(filter);
  const cleanSource = sourceUri.replace('file://', '');
  if (!matrix) {
    await RNFS.copyFile(cleanSource, outputPath);
    return outputPath;
  }
  return ImageFilterModule.applyColorMatrix(
    cleanSource,
    outputPath,
    matrix,
    quality,
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
  const cleanSource = sourceUri.replace('file://', '');
  return ImageFilterModule.applyColorMatrix(
    cleanSource,
    outputPath,
    IDENTITY_MATRIX,
    quality,
  );
}

export interface QuadCorners {
  topLeft: {x: number; y: number};
  topRight: {x: number; y: number};
  bottomRight: {x: number; y: number};
  bottomLeft: {x: number; y: number};
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
  const cleanSource = sourceUri.replace('file://', '');
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
