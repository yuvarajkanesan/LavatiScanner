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
  | 'compression',
  ToolIconToken
> = {
  // These icon names are MaterialIcons glyphs (matching the screen's
  // pre-existing icon strings) — must pin family: 'material' since
  // FeatureBadge defaults to MaterialCommunityIcons, which doesn't have them.
  docs: {icon: 'description', family: 'material', color: '#3B82F6'},
  idcard: {icon: 'badge', family: 'material', color: '#8B5CF6'},
  book: {icon: 'menu-book', family: 'material', color: '#F59E0B'},
  qrcode: {icon: 'qr-code-scanner', family: 'material', color: '#0EA5A5'},
  totext: {icon: 'text-fields', family: 'material', color: '#0EA5E9'},
  folders: {icon: 'folder', color: '#E0A32E'},
  import: {icon: 'file-upload', color: '#22C55E'},
  merge: {icon: 'call-merge', color: '#6366F1'},
  editor: {icon: 'edit-document', family: 'material', color: '#0891B2'},
  sign: {icon: 'draw', color: '#8B5CF6'},
  unlock: {icon: 'lock-open', color: '#EF4444'},
  collage: {icon: 'grid-view', family: 'material', color: '#F97316'},
  watermark: {icon: 'branding-watermark', family: 'material', color: '#0EA5E9'},
  compression: {icon: 'compress', family: 'material', color: '#14B8A6'},
};
