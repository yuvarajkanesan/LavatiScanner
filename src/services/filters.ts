import {FilterType} from '../types/models';

export interface FilterOption {
  id: FilterType;
  label: string;
}

/**
 * Every non-'original' filter is a real pixel-level algorithm (background
 * division, CLAHE, adaptive threshold, morphological shadow removal - see
 * `ImageFilterModule.applyFilterPixels` on the native side), not a linear
 * color matrix, so there's nothing to compute here — `nativeImageFilter.ts`
 * just passes the id straight to the native module. This list is purely the
 * filmstrip's id + label metadata.
 */
export const FILTER_OPTIONS: FilterOption[] = [
  {id: 'original', label: 'Original'},
  {id: 'shadowRemoval', label: 'No Shadow'},
  {id: 'lighten', label: 'Lighten'},
  {id: 'magicColor', label: 'Magic Color'},
  {id: 'grayscale', label: 'Grayscale'},
  {id: 'auto', label: 'Auto'},
  {id: 'sharpen', label: 'Sharpen'},
  {id: 'enhanced', label: 'Enhanced'},
  {id: 'bw', label: 'B&W'},
  {id: 'eco', label: 'Eco'},
  {id: 'invert', label: 'Night'},
];
