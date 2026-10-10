import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared/types';

export interface KnowledgeBaseRow {
  id: string;
  name: string;
  description: string;
  chunk_size: number;
  chunk_overlap: number;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface DocumentRow {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  byte_size: number;
  content_hash: string;
  status: DocumentRecord['status'];
  source: DocumentRecord['source'];
  source_url: string | null;
  ocr_status: DocumentRecord['ocrStatus'];
  ocr_engine: DocumentRecord['ocrEngine'];
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  indexed_at: string | null;
  compile_status?: DocumentRecord['compileStatus'];
  compiled_at?: string | null;
  compile_error?: string | null;
  compile_generation?: number;
}

export function mapKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    chunkSize: row.chunk_size,
    chunkOverlap: row.chunk_overlap,
    documentCount: row.document_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    filename: row.filename,
    fileType: row.file_type,
    byteSize: row.byte_size,
    contentHash: row.content_hash,
    status: row.status,
    source: row.source,
    sourceUrl: row.source_url,
    ocrStatus: row.ocr_status,
    ocrEngine: row.ocr_engine,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    indexedAt: row.indexed_at,
    compileStatus: row.compile_status ?? 'skipped',
    compiledAt: row.compiled_at ?? null,
    compileError: row.compile_error ?? null,
    compileGeneration: row.compile_generation ?? 0,
  };
}
