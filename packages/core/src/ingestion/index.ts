/** @域 barrel 文档摄入/OCR/分块（v1.1 M2 域子路径化） */
export { createIngestionPipeline, type IngestionPipeline } from './ingestion-pipeline';
export { chunkText } from './chunking';
export {
  readDocumentText,
  detectKind,
  readPdfPageItems,
  readPdfPageTexts,
  isImagePdf,
  pageNeedsOcr,
  mergePdfTextItems,
  type PdfPageItems,
} from './read-document';
export {
  resolveEmbeddingTarget,
  type ResolvedEmbeddingTarget,
} from './embedding-target';
export {
  extractDocumentText,
  type ExtractDocumentResult,
  type ExtractHooks,
} from './extract-with-ocr';
export {
  parseDocumentStructure,
  parsePdfDocument,
  parseTextDocument,
  parsePagedTextDocument,
  buildPdfDocument,
  buildPdfLines,
  buildDocxDocument,
  assembleDocument,
  chunkDocument,
  sectionPrefix,
  fallbackParsedDocument,
  renderMarkdownTable,
  mapChunkStructure,
  toStructuredText,
  type BlockSegment,
  type ChunkStructure,
  type StructuredChunk,
  type DocumentBlock,
  type DocumentBlockKind,
  type DocumentTable,
  type ParsedDocument,
} from './structure';
export { runPdfOcr, type OcrRunResult } from './ocr-runner';
export {
  resolveVisionTarget,
  type ResolvedVisionTarget,
} from './vision-target';
export { renderPdfPagesToPng } from './pdf-render';
export type {
  IngestInput,
  IngestResult,
  DocumentKind,
  ChunkSlice,
  ChunkOptions,
} from './types';
