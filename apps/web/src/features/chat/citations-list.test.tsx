// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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

  it('无引用：不渲染容器', () => {
    const { container } = renderWithProviders(<CitationsList message={messageWith(0)} />);
    expect(container.querySelector('[data-testid="citations"]')).toBeNull();
  });
});
