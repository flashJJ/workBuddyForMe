import type { OcrEngine } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { detectKind, isImagePdf, readDocumentText, readPdfPageTexts } from './read-document';
import { runPdfOcr } from './ocr-runner';

export interface ExtractDocumentResult {
  /** 最终用于分片的纯文本 */
  text: string;
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

/**
 * 文档文本提取总入口（v0.4）：
 * - 非 PDF：沿用 Office/纯文本解析器；
 * - 文字层 PDF：直接拼接文字层；
 * - 图片型 PDF（文字密度低于阈值）：视觉模型优先、tesseract 兜底逐页 OCR。
 */
export async function extractDocumentText(
  deps: ServiceDeps,
  filename: string,
  data: Uint8Array,
  hooks?: ExtractHooks,
): Promise<ExtractDocumentResult> {
  if (detectKind(filename) !== 'pdf') {
    return { text: await readDocumentText(filename, data), ocr: null };
  }

  const pageTexts = await readPdfPageTexts(data);
  if (!isImagePdf(pageTexts)) {
    return { text: pageTexts.filter(Boolean).join('\n\n'), ocr: null };
  }

  hooks?.onOcrStart?.();
  const result = await runPdfOcr({
    deps,
    data,
    pageTexts,
    signal: hooks?.signal,
    onProgress: hooks?.onOcrProgress,
  });
  return { text: result.text, ocr: { engine: result.engine, partial: result.partial } };
}
