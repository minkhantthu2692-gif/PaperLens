import type { RefinedImageInfo } from './refinement';

export const DOCUMENT_SCHEMA_VERSION = 2;

export type SourceKind = 'pdf' | 'image' | 'text';

export interface SourceReference {
  assetId: string;
  kind: SourceKind;
  mimeType: string;
  fileName: string;
  size: number;
  pageCount?: number;
  /**
   * Optional refined copy of an image source. The original asset above is never
   * overwritten; OCR can use either version.
   */
  refined?: RefinedImageInfo;
}

export interface EditorContent {
  html: string;
  text: string;
  json: Record<string, unknown> | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  source: SourceReference;
  editor: EditorContent;
}

export interface SourceAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  createdAt: number;
}

export const EMPTY_EDITOR_CONTENT: EditorContent = {
  html: '',
  text: '',
  json: null,
};
