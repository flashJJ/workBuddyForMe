// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message, ToolTraceEntry } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { TurnSummary } from './turn-summary';

function trace(partial: Partial<ToolTraceEntry>): ToolTraceEntry {
  return {
    callId: 'c1',
    tool: 'knowledge_search',
    argsSummary: '{}',
    status: 'ok',
    durationMs: 500,
    resultSummary: 'ok',
    startedAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

function makeMessage(partial: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'assistant',
    content: '回答',
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('回合运行摘要 TurnSummary（v2.27）', () => {
  it('无工具且无引用时不渲染', () => {
    const { container } = renderWithProviders(<TurnSummary message={makeMessage()} />);
    expect(container.querySelector('[data-testid="turn-summary"]')).toBeNull();
  });

  it('汇总工具次数、成败、耗时与引用来源类型', () => {
    renderWithProviders(
      <TurnSummary
        message={makeMessage({
          toolTrace: [
            trace({ callId: 'a', tool: 'knowledge_search', durationMs: 1200 }),
            trace({
              callId: 'b',
              tool: 'fetch_webpage',
              status: 'error',
              error: '请求超时',
              durationMs: 7000,
            }),
          ],
          citations: [
            { documentId: 'd1', documentName: '手册.pdf', ordinal: 0, citeIndex: 1 },
            {
              documentId: 'https://a.com',
              documentName: 'A',
              ordinal: 0,
              citeIndex: 2,
              sourceUrl: 'https://a.com',
            },
          ],
        })}
      />,
    );
    const bar = screen.getByTestId('turn-summary-toggle');
    expect(bar).toHaveTextContent('工具 2 次（成功 1 / 失败 1）');
    expect(bar).toHaveTextContent('工具耗时 8.2s');
    expect(bar).toHaveTextContent('引用 2 条');
    expect(bar).toHaveTextContent('知识库 + 网页');
  });

  it('展开显示输入/输出 token 与逐工具耗时', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TurnSummary
        message={makeMessage({
          toolTrace: [
            trace({ callId: 'a', tool: 'knowledge_search', durationMs: 300 }),
            trace({ callId: 'b', tool: 'web_search', durationMs: 900 }),
          ],
          totalTokens: 1200,
          promptTokens: 900,
          completionTokens: 300,
        })}
      />,
    );
    expect(screen.queryByTestId('turn-summary-detail')).toBeNull();
    await user.click(screen.getByTestId('turn-summary-toggle'));
    expect(screen.getByTestId('turn-summary-detail')).toHaveTextContent('输入 900 / 输出 300 token');
    expect(screen.getAllByTestId('turn-summary-tool')).toHaveLength(2);
  });
});
