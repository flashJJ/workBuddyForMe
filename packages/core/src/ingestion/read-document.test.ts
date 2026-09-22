import { describe, expect, it, vi } from 'vitest';

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

  it('v0.3 Office 三格式识别；未知类型与老式 .doc 给可读错误', () => {
    expect(detectKind('a.docx')).toBe('docx');
    expect(detectKind('a.xlsx')).toBe('xlsx');
    expect(detectKind('a.pptx')).toBe('pptx');
    expect(() => detectKind('a.rtf')).toThrow(/不支持的文件类型/);
    expect(() => detectKind('a')).toThrow(/不支持的文件类型/);
    expect(() => detectKind('old.doc')).toThrow(/另存为新版 .docx/);
  });

  it('pdf：逐页提取文本并在结束后销毁文档', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({
        // 两个 span y 相同 → 合并为一行；第三个 y 不同 → 换行
        items: [
          { str: '你好', transform: [1, 0, 0, 12, 0, 200] },
          { str: 'PDF', transform: [1, 0, 0, 12, 0, 200] },
          { str: '第二行', transform: [1, 0, 0, 11, 0, 180] },
          { noStr: true },
        ],
      }),
    });
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage, destroy }),
    });

    const text = await readDocumentText('paper.pdf', new Uint8Array([1, 2, 3]));
    expect(text).toBe('你好PDF\n第二行');
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
