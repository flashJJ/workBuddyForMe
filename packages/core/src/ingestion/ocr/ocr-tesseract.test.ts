import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createWorker = vi.fn();

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

import { createTesseractSession } from './ocr-tesseract';
import { OcrEngineUnavailableError } from './ocr-errors';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('createTesseractSession（离线 OCR 兜底）', () => {
  it('用 chi_sim+eng 创建 worker，识别返回纯文本并可回收', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: '  识别文本\n ' } });
    const terminate = vi.fn().mockResolvedValue(undefined);
    createWorker.mockResolvedValue({ recognize, terminate });

    const session = await createTesseractSession();
    expect(createWorker).toHaveBeenCalledWith(
      ['chi_sim', 'eng'],
      1,
      expect.objectContaining({}),
    );

    expect(await session.recognize(Buffer.from('png'))).toBe('识别文本');
    await session.terminate();
    expect(recognize).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('环境变量指定本地 core/lang/cache 路径（打包离线资源）', async () => {
    process.env.WBFM_TESSERACT_CORE_PATH = '/resources/tesseract/core';
    process.env.WBFM_TESSERACT_LANG_PATH = '/resources/tesseract/lang';
    process.env.WBFM_TESSERACT_CACHE_PATH = '/tmp/wbfm-tess';
    createWorker.mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn(),
    });

    await createTesseractSession();
    expect(createWorker).toHaveBeenCalledWith(
      ['chi_sim', 'eng'],
      1,
      expect.objectContaining({
        corePath: '/resources/tesseract/core',
        langPath: '/resources/tesseract/lang',
        cachePath: '/tmp/wbfm-tess',
      }),
    );
  });

  it('createWorker 失败（语言包/WASM 不可用）→ OcrEngineUnavailableError', async () => {
    createWorker.mockRejectedValue(new Error('failed to fetch traineddata'));
    await expect(createTesseractSession()).rejects.toBeInstanceOf(OcrEngineUnavailableError);
  });

  it('terminate 异常被吞掉，不影响调用方', async () => {
    createWorker.mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn().mockRejectedValue(new Error('already gone')),
    });
    const session = await createTesseractSession();
    await expect(session.terminate()).resolves.toBeUndefined();
  });
});
