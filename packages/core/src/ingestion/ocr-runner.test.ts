import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatChunk, ChatParams, ChatProvider } from '@wbfm/ai';

// 缩短超时/上限常量，避免单测等待 30s/5min（pageNeedsOcr 阈值保持 50）
vi.mock('@wbfm/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wbfm/shared')>();
  return {
    ...actual,
    OCR_PAGE_TIMEOUT_MS: 50,
    OCR_TOTAL_TIMEOUT_MS: 2_000,
    OCR_MAX_PAGES: 2,
  };
});

const renderPdfPagesToPng = vi.fn();
vi.mock('./pdf-render', () => ({
  renderPdfPagesToPng: (...args: unknown[]) => renderPdfPagesToPng(...args),
}));

const resolveVisionTarget = vi.fn();
vi.mock('./vision-target', () => ({
  resolveVisionTarget: (...args: unknown[]) => resolveVisionTarget(...args),
}));

const createTesseractSession = vi.fn();
vi.mock('./ocr-tesseract', () => ({
  createTesseractSession: (...args: unknown[]) => createTesseractSession(...args),
}));

import { runPdfOcr } from './ocr-runner';
import {
  OcrEngineUnavailableError,
  OcrFailedError,
} from './ocr-errors';

/** 按调用次序逐页返回固定文本的假视觉供应商；hangs=true 时永不产出（测超时） */
function makeVisionProvider(plan: Array<{ text?: string; hang?: boolean; throwOnce?: boolean }>): ChatProvider {
  let index = 0;
  async function* stream(params: ChatParams): AsyncIterable<ChatChunk> {
    const step = plan[index];
    index += 1;
    if (step?.hang) {
      await new Promise<never>((_, reject) => {
        params.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    if (step?.throwOnce) throw new Error('vision 400');
    if (step?.text !== undefined) yield { delta: step.text };
  }
  return {
    supportsTools: false,
    testConnection: vi.fn(),
    listModels: vi.fn(),
    chatStream: stream,
    embed: vi.fn(),
  };
}

function makeTesseractSession(plan: Array<{ text?: string; unavailable?: boolean }>) {
  if (plan[0]?.unavailable) {
    return Promise.reject(new OcrEngineUnavailableError('离线 OCR 组件不可用'));
  }
  let index = 0;
  return Promise.resolve({
    recognize: vi.fn(async () => plan[Math.min(index, plan.length - 1)]?.text ?? ''),
    terminate: vi.fn(async () => {
      index += 1;
    }),
  });
}

const emptyDeps = {} as Parameters<typeof runPdfOcr>[0]['deps'];

beforeEach(() => {
  vi.clearAllMocks();
  renderPdfPagesToPng.mockImplementation(
    async (_d: unknown, pages: number[]) => pages.map((p) => ({ pageNumber: p, png: Buffer.from('x') })),
  );
});

describe('runPdfOcr 编排', () => {
  it('视觉引擎：两页扫描件逐页识别并按页序合并', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: '第一页内容' }, { text: '第二页内容' }]),
      model: { modelId: 'qwen-vl' },
    });
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: ['', ''],
    });
    expect(result.engine).toBe('vision');
    expect(result.partial).toBe(false);
    expect(result.processedPages).toBe(2);
    expect(result.text).toBe('第一页内容\n\n第二页内容');
  });

  it('视觉引擎只打开一次 PDF 批量渲染全部目标页（pdfjs 不可重复 transfer 同一缓冲）', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: '第一页内容' }, { text: '第二页内容' }]),
      model: { modelId: 'qwen-vl' },
    });
    const data = new Uint8Array([1]);
    await runPdfOcr({ deps: emptyDeps, data, pageTexts: ['', ''] });
    expect(renderPdfPagesToPng).toHaveBeenCalledTimes(1);
    expect(renderPdfPagesToPng).toHaveBeenCalledWith(
      data,
      [1, 2],
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('混排 PDF：稠密文字层页保留原文，稀疏页走 OCR', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: 'OCR 出来的扫描页' }]),
      model: { modelId: 'qwen-vl' },
    });
    const dense = '字'.repeat(80);
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: [dense, ''],
    });
    expect(result.text).toContain(dense);
    expect(result.text).toContain('OCR 出来的扫描页');
    expect(result.processedPages).toBe(1);
  });

  it('单页视觉识别超时 → 跳过该页并标记 partial', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ hang: true }, { text: '第二页' }]),
      model: { modelId: 'qwen-vl' },
    });
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: ['', ''],
    });
    expect(result.partial).toBe(true);
    expect(result.processedPages).toBe(1);
    expect(result.text).toBe('第二页');
  });

  it('视觉引擎首个调用即致命失败 → 自动降级 tesseract', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ throwOnce: true }]),
      model: { modelId: 'qwen-vl' },
    });
    createTesseractSession.mockImplementation(() =>
      makeTesseractSession([{ text: 'tesseract 识别结果' }, { text: '第二页' }]),
    );
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: ['', ''],
    });
    expect(result.engine).toBe('tesseract');
    expect(result.text).toContain('tesseract 识别结果');
    expect(createTesseractSession).toHaveBeenCalledOnce();
  });

  it('无视觉模型 → 直接走 tesseract', async () => {
    resolveVisionTarget.mockReturnValue(null);
    createTesseractSession.mockImplementation(() =>
      makeTesseractSession([{ text: '离线识别页' }]),
    );
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: [''],
    });
    expect(result.engine).toBe('tesseract');
    expect(result.text).toBe('离线识别页');
  });

  it('tesseract 不可用且无视觉模型 → 抛 OcrEngineUnavailableError', async () => {
    resolveVisionTarget.mockReturnValue(null);
    createTesseractSession.mockImplementation(() =>
      makeTesseractSession([{ unavailable: true }]),
    );
    await expect(
      runPdfOcr({ deps: emptyDeps, data: new Uint8Array([1]), pageTexts: [''] }),
    ).rejects.toBeInstanceOf(OcrEngineUnavailableError);
  });

  it('超过 OCR_MAX_PAGES(2) 页 → 只处理前 2 页并标记 partial', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: 'p1' }, { text: 'p2' }]),
      model: { modelId: 'qwen-vl' },
    });
    const result = await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: ['', '', '', ''],
    });
    expect(result.partial).toBe(true);
    expect(result.processedPages).toBe(2);
    // 批量渲染：截断后一次性渲染 [1,2]，第 3、4 页不在渲染列表
    expect(renderPdfPagesToPng).toHaveBeenCalledTimes(1);
    expect(renderPdfPagesToPng).toHaveBeenCalledWith(
      expect.anything(),
      [1, 2],
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('所有页面都无任何文本产出 → 抛 OcrFailedError 附可读指引', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: '' }, { text: '' }]),
      model: { modelId: 'qwen-vl' },
    });
    createTesseractSession.mockImplementation(() => makeTesseractSession([{ text: '' }]));
    await expect(
      runPdfOcr({ deps: emptyDeps, data: new Uint8Array([1]), pageTexts: ['', ''] }),
    ).rejects.toBeInstanceOf(OcrFailedError);
  });

  it('onProgress 回调汇报已处理页数', async () => {
    resolveVisionTarget.mockReturnValue({
      provider: makeVisionProvider([{ text: 'a' }, { text: 'b' }]),
      model: { modelId: 'qwen-vl' },
    });
    const progress: Array<[number, number]> = [];
    await runPdfOcr({
      deps: emptyDeps,
      data: new Uint8Array([1]),
      pageTexts: ['', ''],
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress.at(-1)).toEqual([2, 2]);
  });
});
