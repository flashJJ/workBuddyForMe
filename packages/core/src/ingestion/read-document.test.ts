import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@wbfm/shared';

const getDocument = vi.fn();

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { detectKind, readDocumentText } from './read-document';

describe('文档文本提取（TR-16.1）', () => {
  it('txt/md 直读 UTF-8 并去除 BOM', async () => {
    const bytes = new TextEncoder().encode('\uFEFF# 标题\n\n正文');
    expect(await readDocumentText('note.md', bytes)).toBe('# 标题\n\n正文');
    expect(detectKind('a.txt')).toBe('txt');
    expect(detectKind('a.markdown')).toBe('md');
  });

  it('不支持的类型抛 422', () => {
    expect(() => detectKind('a.docx')).toThrow(ApiError);
    expect(() => detectKind('a')).toThrow(/不支持的文件类型/);
  });

  it('pdf：逐页提取文本并在结束后销毁文档', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: '你好' }, { str: 'PDF' }, { noStr: true }],
      }),
    });
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage, destroy }),
    });

    const text = await readDocumentText('paper.pdf', new Uint8Array([1, 2, 3]));
    expect(text).toBe('你好\nPDF');
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
