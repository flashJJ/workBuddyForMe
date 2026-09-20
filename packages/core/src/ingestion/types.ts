import type { DocumentStatus } from '@wbfm/shared';

export type DocumentKind = 'txt' | 'md' | 'pdf';

export interface IngestResult {
  documentId: string;
  status: Extract<DocumentStatus, 'indexed' | 'failed'>;
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
