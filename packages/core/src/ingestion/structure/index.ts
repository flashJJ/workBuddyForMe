import { ApiError } from '@wbfm/shared/errors';
import { detectKind, readPdfPageItems } from '../read-document';
import { readPptx } from '../office/read-pptx';
import { readXlsx } from '../office/read-xlsx';
import { parseDocxDocument, parseOfficeText } from './office-parser';
import { buildPdfDocument } from './pdf-parser';
import { parseTextDocument } from './text-parser';
export type {
  BlockSegment,
  DocumentBlock,
  DocumentBlockKind,
  DocumentTable,
  ParsedDocument,
} from './types';
export {
  assembleDocument,
  fallbackParsedDocument,
  mapChunkStructure,
  renderMarkdownTable,
  toStructuredText,
  type ChunkStructure,
} from './assembler';
export { buildDocxDocument } from './office-parser';
export { buildPdfDocument, buildPdfLines } from './pdf-parser';
export {
  chunkDocument,
  sectionPrefix,
  type StructuredChunk,
} from './chunk-structured';
export { parsePagedTextDocument, parseTextDocument } from './text-parser';

/** 文字层 PDF：读取页坐标后构建结构（调用方负责 OCR 分支） */
export async function parsePdfDocument(data: Uint8Array): Promise<ReturnType<typeof buildPdfDocument>> {
  return buildPdfDocument(await readPdfPageItems(data));
}

/**
 * 统一入口：按扩展名解析文档结构。
 * 解析失败抛可读 ApiError；结构启发式异常由调用方降级，不阻断入库。
 */
export async function parseDocumentStructure(filename: string, data: Uint8Array) {
  const kind = detectKind(filename);
  if (kind === 'pdf') return parsePdfDocument(data);
  if (kind === 'docx') return parseDocxDocument(data);
  if (kind === 'xlsx') return parseOfficeText(readXlsx(data));
  if (kind === 'pptx') return parseOfficeText(readPptx(data));

  const text = new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '');
  if (!text.trim()) throw ApiError.validation('文档内容为空，无法建立结构');
  return parseTextDocument(text);
}
