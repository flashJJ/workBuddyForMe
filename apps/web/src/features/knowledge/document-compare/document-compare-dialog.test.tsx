// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentComparisonResult, DocumentRecord } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { DocumentCompareDialog } from './document-compare-dialog';

function doc(id: string, filename: string): DocumentRecord {
  return {
    id,
    knowledgeBaseId: 'kb1',
    filename,
    fileType: '.md',
    byteSize: 100,
    contentHash: id,
    status: 'indexed',
    source: 'upload',
    sourceUrl: null,
    ocrStatus: null,
    ocrEngine: null,
    errorMessage: null,
    chunkCount: 2,
    createdAt: '2025-01-01T00:00:00.000Z',
    indexedAt: '2025-01-02T00:00:00.000Z',
  };
}

function result(format: 'html' | 'md'): DocumentComparisonResult {
  return {
    artifact: {
      attachmentId: 'a1',
      title: '文档对比：采购合同.md vs 销售合同.md',
      filename: format === 'html' ? 'compare.html' : 'compare.md',
      format,
      mimeType: format === 'html' ? 'text/html' : 'text/markdown',
      byteSize: 120,
    },
    content: format === 'html' ? '<html><body>compare</body></html>' : '# 文档对比\n\n| 章节 |',
    filename: format === 'html' ? 'compare.html' : 'compare.md',
    mimeType: format === 'html' ? 'text/html' : 'text/markdown',
    summary: {
      leftName: '采购合同.md',
      rightName: '销售合同.md',
      sections: { total: 3, shared: 1, leftOnly: 1, rightOnly: 1 },
      tables: { left: 1, right: 1, matched: 1 },
      warnings: ['左侧解析警告：未检测到标题结构'],
    },
  };
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('文档对比弹窗（v2.19 M3）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('选择两份文档生成 HTML 产物：统计、预览/下载与 iframe', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/documents/compare') return ok(result('html'));
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <DocumentCompareDialog
        documents={[doc('d1', '采购合同.md'), doc('d2', '销售合同.md')]}
        open
        onOpenChange={() => undefined}
      />,
    );

    const dialog = await screen.findByTestId('document-compare-dialog');
    expect((within(dialog).getByTestId('compare-left') as HTMLSelectElement).value).toBe('d1');
    expect((within(dialog).getByTestId('compare-right') as HTMLSelectElement).value).toBe('d2');

    await user.click(within(dialog).getByTestId('compare-generate'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents/compare',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/documents/compare');
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
      leftDocumentId: 'd1',
      rightDocumentId: 'd2',
      format: 'html',
    });

    const resultBlock = await screen.findByTestId('compare-result');
    expect(resultBlock).toHaveTextContent('章节：共有 1 · 仅左 1 · 仅右 1');
    expect(resultBlock).toHaveTextContent('表格：匹配 1 / 左 1 · 右 1');
    expect(resultBlock).toHaveTextContent('未检测到标题结构');
    expect(within(resultBlock).getByTestId('compare-preview')).toHaveAttribute(
      'href',
      '/api/artifacts/a1',
    );
    expect(within(resultBlock).getByTestId('compare-download')).toHaveAttribute(
      'href',
      '/api/artifacts/a1?download=1',
    );
    expect(within(resultBlock).getByTestId('compare-html-preview')).toHaveAttribute(
      'src',
      '/api/artifacts/a1',
    );
  });

  it('Markdown 格式直接展示可复制正文', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/documents/compare') return ok(result('md'));
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <DocumentCompareDialog
        documents={[doc('d1', '采购合同.md'), doc('d2', '销售合同.md')]}
        open
        onOpenChange={() => undefined}
      />,
    );
    const dialog = await screen.findByTestId('document-compare-dialog');
    await user.selectOptions(within(dialog).getByTestId('compare-format'), 'md');
    await user.click(within(dialog).getByTestId('compare-generate'));

    const preview = await screen.findByTestId('compare-markdown-preview');
    expect(preview).toHaveTextContent('# 文档对比');
    expect(preview).toHaveTextContent('| 章节 |');
    expect(screen.queryByTestId('compare-html-preview')).toBeNull();
  });
});
