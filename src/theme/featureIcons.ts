import {IconFamily} from '../components/Icon';

/** Semantic icon + accent color for each Document Detail action.
 * Colors are fixed (not theme-swapped) so each action stays recognizable
 * as a small color-coded badge in both light and dark mode. */
export interface FeatureToken {
  icon: string;
  family: IconFamily;
  color: string;
}

export const documentFeatureIcons: Record<
  | 'exportPdf'
  | 'sharePdf'
  | 'shareImage'
  | 'addPage'
  | 'ocr'
  | 'sign'
  | 'moveUp'
  | 'moveDown'
  | 'delete'
  | 'rename'
  | 'saveGallery'
  | 'note'
  | 'pageName'
  | 'editPdf'
  | 'rotate'
  | 'collage'
  | 'shareEmail'
  | 'duplicate'
  | 'moveFolder'
  | 'crop'
  | 'markup'
  | 'shareJpg'
  | 'shareLongImage',
  FeatureToken
> = {
  exportPdf: {icon: 'tray-arrow-down', family: 'community', color: '#3B82F6'},
  sharePdf: {icon: 'file-pdf-box', family: 'community', color: '#EF4444'},
  shareImage: {
    icon: 'image-multiple-outline',
    family: 'community',
    color: '#22C55E',
  },
  addPage: {icon: 'camera-plus-outline', family: 'community', color: '#E0A32E'},
  ocr: {icon: 'ocr', family: 'community', color: '#0EA5A5'},
  sign: {icon: 'draw-pen', family: 'community', color: '#8B5CF6'},
  moveUp: {
    icon: 'arrow-up-bold-circle-outline',
    family: 'community',
    color: '#3B82F6',
  },
  moveDown: {
    icon: 'arrow-down-bold-circle-outline',
    family: 'community',
    color: '#3B82F6',
  },
  delete: {icon: 'trash-can-outline', family: 'community', color: '#EF4444'},
  rename: {icon: 'pencil-outline', family: 'community', color: '#1CA0DE'},
  saveGallery: {icon: 'image-move', family: 'community', color: '#0EA5E9'},
  note: {icon: 'note-text-outline', family: 'community', color: '#F59E0B'},
  pageName: {icon: 'tag-text-outline', family: 'community', color: '#14B8A6'},
  editPdf: {
    icon: 'file-document-edit-outline',
    family: 'community',
    color: '#6366F1',
  },
  rotate: {icon: 'rotate-right', family: 'community', color: '#0891B2'},
  collage: {icon: 'view-grid-outline', family: 'community', color: '#F97316'},
  shareEmail: {icon: 'email-send-outline', family: 'community', color: '#0EA5E9'},
  duplicate: {icon: 'content-copy', family: 'community', color: '#8B5CF6'},
  moveFolder: {
    icon: 'folder-move-outline',
    family: 'community',
    color: '#E0A32E',
  },
  crop: {icon: 'crop', family: 'community', color: '#0EA5A5'},
  markup: {icon: 'draw', family: 'community', color: '#8B5CF6'},
  shareJpg: {icon: 'image-outline', family: 'community', color: '#22C55E'},
  shareLongImage: {
    icon: 'image-multiple-outline',
    family: 'community',
    color: '#22C55E',
  },
};
