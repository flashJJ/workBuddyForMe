import {
  OCR_MAX_PAGES,
  OCR_PAGE_TIMEOUT_MS,
  OCR_TESSERACT_SCALE,
  OCR_TOTAL_TIMEOUT_MS,
  OCR_VISION_MAX_PIXELS,
  OCR_VISION_SCALE,
  type OcrEngine,
} from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { pageNeedsOcr } from './read-document';
import { renderPdfPagesToPng } from './pdf-render';
import { recognizePageWithVision } from './ocr-vision';
import { createTesseractSession } from './ocr-tesseract';
import {
  OcrEngineUnavailableError,
  OcrFailedError,
  OCR_GUIDANCE_MESSAGE,
} from './ocr-errors';
import { resolveVisionTarget } from './vision-target';

export interface OcrRunResult {
  /** 合并文字层页与 OCR 页后的全文 */
  text: string;
  engine: OcrEngine;
  /** true=存在被跳过页（单页超时/总超时/超 50 页），文本不完整 */
  partial: boolean;
  processedPages: number;
  totalPages: number;
}

export interface RunPdfOcrParams {
  deps: ServiceDeps;
  data: Uint8Array;
  /** readPdfPageTexts 产出的逐页文字层 */
  pageTexts: string[];
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** 限时执行：超时抛 OCR_PAGE_TIMEOUT；正常完成时清理定时器 */
function withPageTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('OCR_PAGE_TIMEOUT')), timeoutMs);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

/** 视觉引擎：整份 PDF 只打开一次批量渲染，再逐页识别，单页超时跳过该页 */
async function runVisionPages(
  params: RunPdfOcrParams,
  targets: number[],
  rootSignal: AbortSignal,
  deadlineSignal: AbortSignal,
): Promise<{ ocrByPage: Map<number, string>; partial: boolean; fatal: Error | null }> {
  const target = resolveVisionTarget(params.deps)!;
  const ocrByPage = new Map<number, string>();
  let partial = false;

  // 一次打开 PDF 渲染全部目标页（pdfjs 会 detach 输入缓冲，不能逐页重复打开）
  let pngByPage: Map<number, Buffer>;
  try {
    const rendered = await renderPdfPagesToPng(
      params.data,
      targets,
      OCR_VISION_SCALE,
      OCR_VISION_MAX_PIXELS,
    );
    pngByPage = new Map(rendered.map((page) => [page.pageNumber, page.png]));
  } catch (error) {
    return {
      ocrByPage,
      partial,
      fatal: error instanceof Error ? error : new Error(String(error)),
    };
  }

  for (const pageNumber of targets) {
    if (rootSignal.aborted || deadlineSignal.aborted) return { ocrByPage, partial: true, fatal: null };
    const pageSignal = AbortSignal.any([
      rootSignal,
      deadlineSignal,
      AbortSignal.timeout(OCR_PAGE_TIMEOUT_MS),
    ]);
    try {
      const png = pngByPage.get(pageNumber);
      if (!png) throw new Error('页面渲染失败');
      const text = await recognizePageWithVision(target, png, pageSignal);
      if (text.trim()) ocrByPage.set(pageNumber, text);
      else partial = true; // 视觉模型空响应视为该页失败
    } catch (error) {
      if (isAbortError(error) && !rootSignal.aborted && !deadlineSignal.aborted) {
        partial = true; // 单页超时：跳过该页，继续下一页
        continue;
      }
      if (ocrByPage.size === 0) {
        return { ocrByPage, partial, fatal: error instanceof Error ? error : new Error(String(error)) };
      }
      partial = true; // 上游中断且已有部分结果：收尾为 partial
      break;
    } finally {
      params.onProgress?.(ocrByPage.size, targets.length);
    }
  }
  return { ocrByPage, partial, fatal: null };
}

/** tesseract 引擎：整份 PDF 批量渲染一次，单 worker 逐页识别；单页超时后 worker 不可复用，整体收尾 */
async function runTesseractPages(
  params: RunPdfOcrParams,
  targets: number[],
  rootSignal: AbortSignal,
  deadlineSignal: AbortSignal,
): Promise<{ ocrByPage: Map<number, string>; partial: boolean }> {
  // 一次打开 PDF 渲染全部目标页（pdfjs 会 detach 输入缓冲，不能逐页重复打开）
  const rendered = await renderPdfPagesToPng(params.data, targets, OCR_TESSERACT_SCALE);
  const pngByPage = new Map(rendered.map((page) => [page.pageNumber, page.png]));

  const session = await createTesseractSession();
  const ocrByPage = new Map<number, string>();
  let partial = false;
  try {
    for (const pageNumber of targets) {
      if (rootSignal.aborted || deadlineSignal.aborted) return { ocrByPage, partial: true };
      try {
        const png = pngByPage.get(pageNumber);
        if (!png) throw new Error('页面渲染失败');
        const text = await withPageTimeout(session.recognize(png), OCR_PAGE_TIMEOUT_MS);
        if (text.trim()) ocrByPage.set(pageNumber, text);
        else partial = true;
      } catch (error) {
        partial = true;
        if (
          isAbortError(error) ||
          (error instanceof Error && error.message === 'OCR_PAGE_TIMEOUT')
        ) {
          break; // worker 可能已脏，不再继续
        }
        if (ocrByPage.size === 0) throw error;
        break;
      } finally {
        params.onProgress?.(ocrByPage.size, targets.length);
      }
    }
  } finally {
    await session.terminate().catch(() => undefined);
  }
  return { ocrByPage, partial };
}

function assembleText(pageTexts: string[], ocrByPage: Map<number, string>): string {
  return pageTexts
    .map((layer, index) => {
      const ocr = ocrByPage.get(index + 1);
      return ocr && ocr.trim() ? ocr : layer;
    })
    .filter((t) => t.trim().length > 0)
    .join('\n\n');
}

/**
 * 图片型 PDF OCR 主编排：
 * 视觉模型优先；视觉引擎无任何产出即失败时降级 tesseract；
 * 两者都不可用/无文本时抛错（调用方标记 failed + 可读指引）。
 */
export async function runPdfOcr(params: RunPdfOcrParams): Promise<OcrRunResult> {
  const sparsePages = params.pageTexts
    .map((text, index) => ({ pageNumber: index + 1, text }))
    .filter((p) => pageNeedsOcr(p.text))
    .map((p) => p.pageNumber);

  const totalPages = params.pageTexts.length;
  if (sparsePages.length === 0) {
    return {
      text: params.pageTexts.filter(Boolean).join('\n\n'),
      engine: 'vision',
      partial: false,
      processedPages: 0,
      totalPages,
    };
  }

  let capped = false;
  let targets = sparsePages;
  if (targets.length > OCR_MAX_PAGES) {
    targets = targets.slice(0, OCR_MAX_PAGES);
    capped = true;
  }

  const ownedController = params.signal ? null : new AbortController();
  const rootSignal = params.signal ?? ownedController!.signal;
  const deadlineController = new AbortController();
  const timer = setTimeout(
    () => deadlineController.abort(new Error('OCR_TOTAL_TIMEOUT')),
    OCR_TOTAL_TIMEOUT_MS,
  );
  // 外部取消联动总 deadline
  const onExternalAbort = () => deadlineController.abort(new Error('OCR_ABORTED'));
  if (params.signal) params.signal.addEventListener('abort', onExternalAbort, { once: true });

  let engine: OcrEngine = resolveVisionTarget(params.deps) ? 'vision' : 'tesseract';
  let ocrByPage = new Map<number, string>();
  let partial = false;

  try {
    if (engine === 'vision') {
      const vision = await runVisionPages(params, targets, rootSignal, deadlineController.signal);
      ocrByPage = vision.ocrByPage;
      partial = vision.partial;
      // 视觉引擎零产出致命失败 → 降级 tesseract
      if (vision.fatal && ocrByPage.size === 0) engine = 'tesseract';
    }
    if (engine === 'tesseract') {
      const tesseract = await runTesseractPages(
        params,
        targets,
        rootSignal,
        deadlineController.signal,
      );
      ocrByPage = tesseract.ocrByPage;
      partial = partial || tesseract.partial;
    }
  } catch (error) {
    if (error instanceof OcrEngineUnavailableError) throw error;
    throw new OcrFailedError(
      `扫描件识别失败：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', onExternalAbort);
  }

  const text = assembleText(params.pageTexts, ocrByPage);
  if (!text.trim()) throw new OcrFailedError(OCR_GUIDANCE_MESSAGE);

  const timedOut = deadlineController.signal.aborted;
  return {
    text,
    engine,
    partial: partial || capped || timedOut || ocrByPage.size < targets.length,
    processedPages: ocrByPage.size,
    totalPages,
  };
}
