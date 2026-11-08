// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Citation, Message } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { CitationsList } from './citations-list';

function cite(ordinal: number, name: string): Citation {
  return {
    documentId: `doc-${ordinal}`,
    documentName: name,
    ordinal,
    snippet: `片段 ${ordinal}`,
    sourceUrl: null,
    pageNo: null,
    paragraphNo: null,
    charStart: undefined,
    charEnd: undefined,
    staticKind: 'chunk',
  };
}

function messageWith(count: number): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'assistant',
    content: '正文',
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: Array.from({ length: count }, (_, i) => cite(i, `文档${i}.pdf`)),
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('CitationsList 引用来源折叠（v1.5）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('3 条以内：平铺展示，无折叠开关', () => {
    renderWithProviders(<CitationsList message={messageWith(3)} />);
    expect(screen.queryByTestId('citations-toggle')).toBeNull();
    expect(screen.getByTestId('citations-list')).toBeInTheDocument();
    expect(screen.getByText('文档0.pdf')).toBeInTheDocument();
    expect(screen.getByText('文档2.pdf')).toBeInTheDocument();
  });

  it('超过 3 条：默认折叠不渲染条目，点击展开后可见全部，可再收起', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CitationsList message={messageWith(6)} />);

    // 默认折叠：标题条显示总数，列表不在 DOM
    const toggle = screen.getByTestId('citations-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.textContent).toContain('6');
    expect(screen.queryByTestId('citations-list')).toBeNull();
    expect(screen.queryByText('文档5.pdf')).toBeNull();

    // 展开：6 条全部渲染
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('citations-list')).toBeInTheDocument();
    expect(screen.getByText('文档0.pdf')).toBeInTheDocument();
    expect(screen.getByText('文档5.pdf')).toBeInTheDocument();

    // 再点收起
    await user.click(toggle);
    expect(screen.queryByTestId('citations-list')).toBeNull();
  });

  it('流式增长：从 2 条涨到 6 条时自动折叠，不会停留在展开态', () => {
    const { rerender } = renderWithProviders(<CitationsList message={messageWith(2)} />);
    expect(screen.queryByTestId('citations-toggle')).toBeNull();
    expect(screen.getByTestId('citations-list')).toBeInTheDocument();

    rerender(<CitationsList message={messageWith(6)} />);
    const toggle = screen.getByTestId('citations-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('citations-list')).toBeNull();
  });

  it('用户手动展开后，引用继续增长仍保持展开', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<CitationsList message={messageWith(6)} />);
    await user.click(screen.getByTestId('citations-toggle'));

    rerender(<CitationsList message={messageWith(8)} />);
    expect(screen.getByTestId('citations-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('citations-list')).toBeInTheDocument();
  });

  it('无引用：不渲染容器', () => {
    const { container } = renderWithProviders(<CitationsList message={messageWith(0)} />);
    expect(container.querySelector('[data-testid="citations"]')).toBeNull();
  });

  it('v2.19：展示章节路径与表格行定位', () => {
    const base = messageWith(1);
    renderWithProviders(
      <CitationsList
        message={{
          ...base,
          citations: [
            {
              ...cite(0, 'contract.pdf'),
              sectionPath: ['合同', '付款条款'],
              tableNo: 2,
              tableRow: 3,
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('citation-section')).toHaveTextContent('合同 › 付款条款');
    expect(screen.getByTestId('citation-location')).toHaveTextContent('表 2 · 第 3 行');
  });

  it('v2.19 M5：关系事实引用展示「关系知识」标签', () => {
    const base = messageWith(1);
    renderWithProviders(
      <CitationsList
        message={{
          ...base,
          citations: [
            {
              ...cite(0, 'graph.txt'),
              staticKind: 'relation',
              snippet: '关系：Acme —[收购]→ Beta。',
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('citation-static-kind')).toHaveTextContent('关系知识');
  });

  it('v2.19 M4：点击本地引用打开结构查看器并定位章节/表格', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const structure =
          url === '/api/documents/doc-0/structure'
            ? {
                documentId: 'doc-0',
                parsedAt: '2026-11-02T00:00:00.000Z',
                structureAvailable: true,
                pages: [],
                sections: [{ path: ['合同', '付款条款'], blockIds: ['b1'] }],
                blocks: [
                  {
                    id: 'b1',
                    kind: 'heading',
                    pageNo: 1,
                    sectionPath: ['合同', '付款条款'],
                    content: '付款条款',
                    charStart: 0,
                    charEnd: 4,
                  },
                ],
                tables: [],
                warnings: [],
                visionAvailable: false,
              }
            : null;
        return new Response(JSON.stringify({ success: true, data: structure }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const user = userEvent.setup();
    const base = messageWith(1);
    renderWithProviders(
      <CitationsList
        message={{
          ...base,
          citations: [
            {
              ...cite(0, 'contract.pdf'),
              sectionPath: ['合同', '付款条款'],
              tableNo: 2,
              tableRow: 3,
              tableCell: 'B3',
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByTestId('citation-open'));
    const dialog = await screen.findByTestId('document-structure-dialog');
    expect(await within(dialog).findByTestId('citation-focus')).toHaveTextContent(
      '合同 › 付款条款 · 表 2 · 第 3 行 · B3',
    );
    expect(within(dialog).getByTestId('structure-sections')).toHaveTextContent(/付款条款/);
  });
});
