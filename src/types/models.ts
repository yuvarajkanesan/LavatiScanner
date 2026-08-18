export type FilterType = 'original' | 'bw' | 'grayscale' | 'enhanced' | 'clean';

/** A single OCR'd line of text and its position, as 0..1 ratios of the page
 * image's own width/height (top-left origin) — JSON-serialized into
 * `Page.ocrBlocks` and used to place an invisible searchable-text layer
 * over the image when exporting a PDF. */
export interface OcrBlockRatio {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

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
  /** JSON-serialized array of ratio-space OCR blocks (see
   * `OcrBlockRatio` in services/scanPipeline.ts) for the searchable-PDF text layer. */
  ocrBlocks: string | null;
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
  totalSizeBytes: number;
}
