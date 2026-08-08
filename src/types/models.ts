export type FilterType = 'original' | 'bw' | 'grayscale' | 'enhanced' | 'clean';

export interface Folder {
  id: string;
  name: string;
  isLocked: boolean;
  createdAt: number;
}

export interface Document {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Page {
  id: string;
  docId: string;
  pageIndex: number;
  filePath: string;
  ocrText: string | null;
  pageName: string | null;
  note: string | null;
  createdAt: number;
}

export interface DocumentWithPages extends Document {
  pages: Page[];
}

export interface DocumentSummary extends Document {
  pageCount: number;
  thumbnailPath: string | null;
}
