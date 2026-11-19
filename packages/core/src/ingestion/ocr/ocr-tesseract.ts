import process from 'node:process';
import { OcrEngineUnavailableError } from './ocr-errors';

/**
 * tesseract.js 离线 OCR 兜底（v0.4）：WASM worker + chi_sim/eng 语言包。
 * - 包体按需 dynamic import：未安装/平台不兼容不影响主流程（视觉 OCR 路径零影响）；
 * - corePath/langPath/cachePath 走环境变量，打包桌面端可指向 resources 内置资源：
 *   WBFM_TESSERACT_CORE_PATH / WBFM_TESSERACT_LANG_PATH / WBFM_TESSERACT_CACHE_PATH；
 * - 未配置本地路径时按 tesseract.js 默认策略（首次使用从 CDN 下载到缓存目录）。
 */

export interface TesseractRuntimeOptions {
  corePath?: string;
  langPath?: string;
  cachePath?: string;
}

export interface TesseractSession {
  /** 识别单页位图；返回纯文本 */
  recognize(png: Buffer): Promise<string>;
  /** 回收 WASM worker（超时/单页失败后必须终止，识别调用不可中断复用） */
  terminate(): Promise<void>;
}

type TesseractModule = typeof import('tesseract.js');

function resolveOptions(): TesseractRuntimeOptions {
  return {
    corePath: process.env.WBFM_TESSERACT_CORE_PATH || undefined,
    langPath: process.env.WBFM_TESSERACT_LANG_PATH || undefined,
    cachePath: process.env.WBFM_TESSERACT_CACHE_PATH || undefined,
  };
}

/** 创建中英文识别会话；模块缺失或语言数据不可用时抛 OcrEngineUnavailableError */
export async function createTesseractSession(
  overrides?: TesseractRuntimeOptions,
): Promise<TesseractSession> {
  let mod: TesseractModule;
  try {
    mod = await import('tesseract.js');
  } catch {
    throw new OcrEngineUnavailableError('离线 OCR 组件 tesseract.js 未安装');
  }

  const options = { ...resolveOptions(), ...overrides };
  let worker: import('tesseract.js').Worker;
  try {
    worker = await mod.createWorker(['chi_sim', 'eng'], 1, {
      ...(options.corePath ? { corePath: options.corePath } : {}),
      ...(options.langPath ? { langPath: options.langPath } : {}),
      ...(options.cachePath ? { cachePath: options.cachePath } : {}),
    });
  } catch (error) {
    throw new OcrEngineUnavailableError(
      `离线 OCR 初始化失败（语言包或 WASM 不可用）：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    async recognize(png: Buffer): Promise<string> {
      const result = await worker.recognize(png);
      return result.data.text.trim();
    },
    async terminate(): Promise<void> {
      // worker 可能已因超时/并发被回收，重复终止不应抛出
      await worker.terminate().catch(() => undefined);
    },
  };
}
