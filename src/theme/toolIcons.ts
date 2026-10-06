import {IconFamily} from '../components/Icon';

/** Per-tool icon color for the Tools grid, mirroring the featureIcons.ts
 * pattern — gives each shortcut its own recognizable identity instead of a
 * single flat accent color for every card. Colors are fixed (not
 * theme-swapped) so each tool stays recognizable in both light and dark mode. */
export interface ToolIconToken {
  icon: string;
  family?: IconFamily;
  color: string;
}

export const toolIcons: Record<
  | 'docs'
  | 'idcard'
  | 'book'
  | 'qrcode'
  | 'totext'
  | 'folders'
  | 'import'
  | 'merge'
  | 'editor'
  | 'sign'
  | 'unlock'
  | 'collage'
  | 'watermark'
  | 'compression'
  | 'images'
  | 'share'
  | 'more',
  ToolIconToken
> = {
  // Thin outline glyphs (MaterialCommunityIcons) to match the app's current
  // icon language (Home's quick actions, Settings' rows) — colors are no
  // longer rendered (ToolGrid always tints with the theme accent), but stay
  // defined here in case a future screen wants per-tool color coding back.
  docs: {icon: 'line-scan', color: '#3B82F6'},
  idcard: {icon: 'card-account-details-outline', color: '#8B5CF6'},
  book: {icon: 'book-open-outline', color: '#F59E0B'},
  qrcode: {icon: 'qrcode-scan', color: '#0EA5A5'},
  totext: {icon: 'text-recognition', color: '#0EA5E9'},
  folders: {icon: 'folder-outline', color: '#E0A32E'},
  import: {icon: 'file-import-outline', color: '#22C55E'},
  merge: {icon: 'call-merge', color: '#6366F1'},
  editor: {icon: 'file-document-edit-outline', color: '#0891B2'},
  sign: {icon: 'signature-freehand', color: '#8B5CF6'},
  unlock: {icon: 'lock-open-variant-outline', color: '#EF4444'},
  collage: {icon: 'image-multiple-outline', color: '#F97316'},
  watermark: {icon: 'water-outline', color: '#0EA5E9'},
  compression: {icon: 'arrow-collapse', color: '#14B8A6'},
  images: {icon: 'image-outline', color: '#22C55E'},
  share: {icon: 'share-outline', color: '#EF4444'},
  more: {icon: 'dots-grid', color: '#64748B'},
};
