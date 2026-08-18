import {
  concatColorMatrices,
  grayscale,
  contrast,
  saturate,
  brightness,
} from 'react-native-color-matrix-image-filters';
import {FilterType} from '../types/models';

export interface FilterOption {
  id: FilterType;
  label: string;
}

export const FILTER_OPTIONS: FilterOption[] = [
  {id: 'original', label: 'Original'},
  {id: 'clean', label: 'Clean (No Shadows)'},
  {id: 'bw', label: 'B&W'},
  {id: 'grayscale', label: 'Grayscale'},
  {id: 'enhanced', label: 'Enhanced'},
];

const bwMatrix = concatColorMatrices(grayscale(), contrast(2.2));
const enhancedMatrix = concatColorMatrices(contrast(1.15), saturate(1.25));
// Lifts everything (including gray crease/fold shadows from wrinkled paper or
// photocopies) toward white before applying contrast, so shadows clip to white
// instead of the plain B&W filter's symmetric contrast pushing them toward black.
const cleanMatrix = concatColorMatrices(
  grayscale(),
  brightness(1.45),
  contrast(1.9),
);

/**
 * Raw 4x5 Android color matrix for a filter, or null for 'original' (no-op).
 * These are plain number arrays - safe to compute anywhere, unlike the GPU
 * ColorMatrix view these values used to feed directly.
 */
export function getFilterMatrix(filter: FilterType): number[] | null {
  switch (filter) {
    case 'grayscale':
      return grayscale();
    case 'bw':
      return bwMatrix;
    case 'clean':
      return cleanMatrix;
    case 'enhanced':
      return enhancedMatrix;
    case 'original':
    default:
      return null;
  }
}

/**
 * Amount for the native unsharp-mask pass (0 = skip it). The color matrix
 * filters are pure per-pixel tone adjustments and can't add or remove
 * sharpness on their own, but baking ANY filter means decoding and
 * re-encoding the JPEG, and that extra generation of lossy compression makes
 * scanned text look softer than the original capture — every filter gets a
 * compensating sharpen pass so letters don't come out thinner/partially
 * eroded than the original, not just "Enhanced"/"Clean". "B&W" in particular
 * needs it: its high contrast() snaps already JPEG-softened pixels at the
 * edge of a letter stroke toward white, which visibly erodes thin text —
 * sharpening first restores those edges before contrast clips them.
 */
export function getSharpenAmount(filter: FilterType): number {
  switch (filter) {
    case 'enhanced':
      return 0.4;
    case 'clean':
      return 0.25;
    case 'bw':
      return 0.3;
    case 'grayscale':
      return 0.2;
    default:
      return 0;
  }
}
