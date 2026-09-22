import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * v0.4 PDF 页面渲染：pdfjs + @napi-rs/canvas（预编译 N-API 二进制，免 node-gyp）。
 * canvas 库动态 import：纯文字 PDF 与单测 mock pdfjs 时不加载原生模块。
 */

export interface RenderedPdfPage {
  /** 1 基页码 */
  pageNumber: number;
  /** PNG 编码后的页面位图 */
  png: Buffer;
}

type NapiCanvasModule = typeof import('@napi-rs/canvas');
let canvasModulePromise: Promise<NapiCanvasModule> | null = null;

/** 加载 @napi-rs/canvas；未安装/二进制缺失时抛可读错误 */
async function loadCanvas(): Promise<NapiCanvasModule> {
  if (!canvasModulePromise) {
    canvasModulePromise = import('@napi-rs/canvas') as Promise<NapiCanvasModule>;
  }
  return canvasModulePromise;
}

/**
 * 计算实际渲染缩放：不超过请求缩放，且总像素不超过 maxPixels（给视觉模型控 token）。
 * 宽高比保持不变（取宽高双向约束的同一因子）。
 */
export function resolveRenderScale(
  baseWidth: number,
  baseHeight: number,
  requestedScale: number,
  maxPixels?: number,
): number {
  if (!maxPixels || maxPixels <= 0) return requestedScale;
  const basePixels = baseWidth * baseHeight;
  if (basePixels <= 0) return requestedScale;
  const maxScale = Math.sqrt(maxPixels / basePixels);
  return Math.min(requestedScale, maxScale);
}

/**
 * 将指定页渲染为 PNG。
 * @param scale 期望渲染缩放：视觉模型建议 2，tesseract 建议 3（≈288DPI）
 * @param maxPixels 单页像素上限（视觉模型控 image token）；超过则等比缩回
 */
export async function renderPdfPagesToPng(
  data: Uint8Array,
  pageNumbers: readonly number[],
  scale: number,
  maxPixels?: number,
): Promise<RenderedPdfPage[]> {
  const canvasLib = await loadCanvas();
  // pdfjs 在 Node fake-worker 下会 transfer（detach）输入缓冲，必须传副本，
  // 否则调用方（同一份 PDF 数据按页多次打开）第二次起即 DataCloneError
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
  try {
    const rendered: RenderedPdfPage[] = [];
    for (const pageNumber of pageNumbers) {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const effectiveScale = resolveRenderScale(
        baseViewport.width,
        baseViewport.height,
        scale,
        maxPixels,
      );
      const viewport = page.getViewport({ scale: effectiveScale });
      const canvas = canvasLib.createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      // pdfjs 的 RenderParameters 以 DOM Canvas 类型声明；@napi-rs/canvas 结构兼容
      type RenderParams = Parameters<typeof page.render>[0];
      await page
        .render({ canvasContext: ctx, viewport } as unknown as RenderParams)
        .promise;

      rendered.push({ pageNumber, png: canvas.toBuffer('image/png') });
    }
    return rendered;
  } finally {
    await doc.destroy();
  }
}
