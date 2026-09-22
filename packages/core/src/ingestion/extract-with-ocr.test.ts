import { describe, expect, it, vi } from 'vitest';

const getDocument = vi.fn();
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

const runPdfOcr = vi.fn();
vi.mock('./ocr-runner', () => ({
  runPdfOcr: (...args: unknown[]) => runPdfOcr(...args),
}));

import { extractDocumentText } from './extract-with-ocr';

function mockPdfPages(pageTexts: string[]) {
  const getPage = vi.fn(async () => ({
    getTextContent: vi.fn(async () => ({
      items: pageTexts.map((text) => ({ str: text, transform: [1, 0, 0, 12, 0, 200] })),
    })),
  }));
  const destroy = vi.fn(async () => undefined);
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: pageTexts.length, getPage, destroy }),
  });
}

describe('extractDocumentText OCR 入口（v0.4）', () => {
  const deps = {} as never;

  it('非 PDF：直接走既有解析器，不触发 OCR', async () => {
    const result = await extractDocumentText(
      deps,
      'a.txt',
      new TextEncoder().encode('纯文本内容'),
    );
    expect(result.ocr).toBeNull();
    expect(result.text).toBe('纯文本内容');
    expect(runPdfOcr).not.toHaveBeenCalled();
  });

  it('文字层充实的 PDF：直接使用文字层，不触发 OCR', async () => {
    mockPdfPages(['这是一段足够长的文字层内容'.repeat(5)]);
    const result = await extractDocumentText(deps, 'paper.pdf', new Uint8Array([1]));
    expect(result.ocr).toBeNull();
    expect(result.text).toContain('文字层');
    expect(runPdfOcr).not.toHaveBeenCalled();
  });

  it('扫描件（文字层为空）：触发 onOcrStart 并把 runner 结果透传', async () => {
    mockPdfPages(['', '', '']);
    runPdfOcr.mockResolvedValue({
      text: 'OCR 全文',
      engine: 'vision',
      partial: false,
      processedPages: 3,
      totalPages: 3,
    });
    const onOcrStart = vi.fn();
    const onOcrProgress = vi.fn();
    const result = await extractDocumentText(deps, 'scan.pdf', new Uint8Array([1]), {
      onOcrStart,
      onOcrProgress,
    });
    expect(result.ocr).toEqual({ engine: 'vision', partial: false });
    expect(result.text).toBe('OCR 全文');
    expect(onOcrStart).toHaveBeenCalledOnce();
    expect(runPdfOcr).toHaveBeenCalledWith(
      expect.objectContaining({
        pageTexts: ['', '', ''],
        onProgress: onOcrProgress,
      }),
    );
  });
});
