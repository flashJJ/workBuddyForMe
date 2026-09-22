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
 * 将指定页渲染为 PNG。
 * @param scale 渲染缩放：视觉模型建议 2（控 token），tesseract 建议 3（≈288DPI 保识别率）
 */
export async function renderPdfPagesToPng(
  data: Uint8Array,
  pageNumbers: readonly number[],
  scale: number,
): Promise<RenderedPdfPage[]> {
  const canvasLib = await loadCanvas();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const rendered: RenderedPdfPage[] = [];
    for (const pageNumber of pageNumbers) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
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
