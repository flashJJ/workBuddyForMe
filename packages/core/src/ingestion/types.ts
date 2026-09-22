import type { DocumentStatus } from '@wbfm/shared';

export type DocumentKind = 'txt' | 'md' | 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface IngestResult {
  documentId: string;
  /** v0.4：partial = 扫描件 OCR 只识别了部分页面（超时/超页数） */
  status: Extract<DocumentStatus, 'indexed' | 'failed' | 'partial'>;
  chunkCount: number;
  errorMessage?: string;
}

export interface IngestInput {
  documentId: string;
  buffer: Uint8Array;
  signal?: AbortSignal;
}

export interface ChunkSlice {
  content: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}
