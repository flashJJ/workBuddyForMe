import type { OcrEngine } from '@wbfm/shared/constants';
import type { ServiceDeps } from '../services/base/deps';
import {
  detectKind,
  isImagePdf,
  mergePdfTextItems,
  pageNeedsOcr,
  readDocumentText,
  readPdfPageItems,
} from './read-document';
import { runPdfOcr } from './ocr-runner';
import {
  buildPdfDocument,
  fallbackParsedDocument,
  parseDocumentStructure,
  parsePagedTextDocument,
  toStructuredText,
  type ParsedDocument,
} from './structure';
import {
  assemblePagedText,
  assemblePlainText,
  type StructuredText,
} from './text-structure';

export interface ExtractDocumentResult {
  /** 最终用于分片的纯文本 */
  text: string;
  /** v1.3：源段落块结构（页/段坐标），与 text 偏移对齐 */
  structure: StructuredText;
  /** v2.19：解析后的页/章节/表格结构（结构解析失败的调用方 mock 可缺省） */
  parsed?: ParsedDocument;
  /** 非 null 表示该 PDF 走了 OCR 兜底 */
  ocr: { engine: OcrEngine; partial: boolean } | null;
}

export interface ExtractHooks {
  signal?: AbortSignal;
  /** 确认是扫描件、OCR 即将开始时触发（用于写入 ocr_status=running） */
  onOcrStart?: () => void;
  /** OCR 进度：已处理页数 / 待识别页数 */
  onOcrProgress?: (processed: number, total: number) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 结构解析失败时回退到旧文本/页段口径，保证文档仍可入库 */
function fallbackFromPlainText(
  text: string,
  reason: string,
): { text: string; structure: StructuredText; parsed: ParsedDocument } {
  const structure = assemblePlainText(text);
  return {
    text: structure.text,
    structure,
    parsed: fallbackParsedDocument(structure, [`结构解析失败，已回退为纯文本：${reason}`]),
  };
}

/**
 * 文档文本提取总入口（v0.4）：
 * - 非 PDF：先走结构解析；失败回退既有纯文本解析器；
 * - 文字层 PDF：按 TextItem 坐标提取页/章节/表格结构；
 * - 图片型 PDF：视觉模型优先、tesseract 兜底逐页 OCR，OCR 文本再做结构启发式。
 */
export async function extractDocumentText(
  deps: ServiceDeps,
  filename: string,
  data: Uint8Array,
  hooks?: ExtractHooks,
): Promise<ExtractDocumentResult> {
  if (detectKind(filename) !== 'pdf') {
    try {
      const parsed = await parseDocumentStructure(filename, data);
      return {
        text: parsed.text,
        structure: toStructuredText(parsed),
        parsed,
        ocr: null,
      };
    } catch (structureError) {
      try {
        const text = await readDocumentText(filename, data);
        return { ...fallbackFromPlainText(text, errorMessage(structureError)), ocr: null };
      } catch {
        throw structureError;
      }
    }
  }

  const pages = await readPdfPageItems(data);
  const pageTexts = pages.map((page) => mergePdfTextItems(page.items).trim());
  if (!isImagePdf(pageTexts)) {
    try {
      const parsed = buildPdfDocument(pages);
      return { text: parsed.text, structure: toStructuredText(parsed), parsed, ocr: null };
    } catch (structureError) {
      const structure = assemblePagedText(
        pageTexts.map((text, index) => ({ pageNo: index + 1, text })),
      );
      const parsed = fallbackParsedDocument(structure, [
        `结构解析失败，已回退为纯文本：${errorMessage(structureError)}`,
      ]);
      return { text: structure.text, structure, parsed, ocr: null };
    }
  }

  hooks?.onOcrStart?.();
  const result = await runPdfOcr({
    deps,
    data,
    pageTexts,
    signal: hooks?.signal,
    onProgress: hooks?.onOcrProgress,
  });
  const warnings = pageTexts.flatMap((text, index) =>
    pageNeedsOcr(text) ? [`第 ${index + 1} 页文字层稀疏，已使用 OCR 文本重建结构`] : [],
  );
  const parsed = parsePagedTextDocument(result.pages, warnings);
  return {
    text: parsed.text,
    structure: toStructuredText(parsed),
    parsed,
    ocr: { engine: result.engine, partial: result.partial },
  };
}
