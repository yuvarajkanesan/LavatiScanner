import {useWindowDimensions} from 'react-native';

const TABLET_BP = 600; // matches Android's sw600dp convention
const LARGE_TABLET_BP = 900;

/** RN's style `width` only accepts this exact template-literal shape for
 * percentages, not a generic `string` — this cast lives in one place. */
export type PercentWidth = `${number}%`;

export function percentWidth(value: number): PercentWidth {
  return `${value}%` as PercentWidth;
}

export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  /** Column count for document/page grids (Home, Folder, Document Detail). */
  gridColumns: number;
  /** Column count for the Tools screen's flex-wrap grid. */
  toolColumns: number;
  /** Cap for centered sheets/dialogs/forms so they don't stretch edge-to-edge on large screens. */
  contentMaxWidth: number;
}

/** Single source of truth for breakpoint-driven layout — reactive to
 * rotation/resize/multi-window via useWindowDimensions, unlike a one-off
 * Dimensions.get() snapshot. */
export function useResponsive(): Responsive {
  const {width, height} = useWindowDimensions();
  const isTablet = width >= TABLET_BP;
  const gridColumns = width >= LARGE_TABLET_BP ? 4 : isTablet ? 3 : 2;
  const toolColumns = width >= LARGE_TABLET_BP ? 5 : isTablet ? 4 : 3;
  const contentMaxWidth = isTablet ? 480 : width;
  return {width, height, isTablet, gridColumns, toolColumns, contentMaxWidth};
}
