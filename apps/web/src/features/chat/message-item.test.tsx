// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { copyText } from '@/lib/utils/clipboard';
import { MessageItem } from './message-item';

vi.mock('@/lib/utils/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

function makeMessage(partial: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'assistant',
    content: '**你好**',
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

describe('消息项 MessageItem（TR-27.1）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('助手消息按 Markdown 渲染，复制按钮写入剪贴板', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessageItem message={makeMessage()} assistantName="通用助手" />);

    expect(screen.getByText('你好').tagName).toBe('STRONG');
    await user.click(screen.getByRole('button', { name: '复制' }));
    expect(copyText).toHaveBeenCalledWith('**你好**');
    expect(screen.getByText('已复制')).toBeInTheDocument();
  });

  it('错误消息展示原因并提供重新生成', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MessageItem
        message={makeMessage({
          status: 'error',
          content: '',
          errorCode: 'PROVIDER_ERROR',
          errorMessage: '上游 500',
        })}
        assistantName="通用助手"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('message-error')).toHaveTextContent('上游 500');
    await user.click(screen.getByRole('button', { name: '重新生成' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('渲染工具调用轨迹卡片并可展开详情', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MessageItem
        message={makeMessage({
          toolTrace: [
            {
              callId: 'call-1',
              tool: 'current_time',
              argsSummary: '当前时间',
              status: 'ok',
              durationMs: 42,
              resultSummary: '2025-01-01 10:00:00',
              startedAt: '2025-01-01T10:00:00.000Z',
            },
          ],
        })}
        assistantName="通用助手"
      />,
    );
    const row = screen.getByTestId('tool-trace-row');
    expect(row).toHaveTextContent('查询当前时间');
    expect(row).toHaveTextContent('42ms');
    await user.click(row.querySelector('button')!);
    expect(screen.getByText('current_time')).toBeInTheDocument();
  });

  it('渲染引用来源的序号、文档名与片段', () => {
    renderWithProviders(
      <MessageItem
        message={makeMessage({
          citations: [
            { documentId: 'd1', documentName: '手册.pdf', ordinal: 1, snippet: '参见第三章' },
          ],
        })}
        assistantName="通用助手"
      />,
    );
    expect(screen.getByTestId('citations')).toHaveTextContent('手册.pdf');
    expect(screen.getByTestId('citations')).toHaveTextContent('参见第三章');
    expect(screen.getByText('[1]')).toBeInTheDocument();
  });

  it('反馈：点击 👍 发 up 并回调；已选状态再点发 null 取消', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as {
        feedback: 'up' | null;
      };
      return new Response(
        JSON.stringify({
          success: true,
          data: makeMessage({
            feedback: body.feedback,
            feedbackAt: body.feedback ? '2025-03-01T00:00:00.000Z' : null,
          }),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn();
    const user = userEvent.setup();

    const { rerender } = renderWithProviders(
      <MessageItem message={makeMessage()} assistantName="通用助手" onFeedback={onApplied} />,
    );
    await user.click(screen.getByTestId('feedback-up'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const first = fetchMock.mock.calls[0]!;
    expect(first[0]).toBe('/api/conversations/c1/messages/m1');
    expect((first[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((first[1] as RequestInit).body as string)).toEqual({ feedback: 'up' });
    expect(onApplied).toHaveBeenCalledWith('m1', 'up', expect.any(String));

    // 已选 up 状态再点一次 → null 取消
    rerender(
      <MessageItem
        message={makeMessage({ feedback: 'up', feedbackAt: '2025-03-01T00:00:00.000Z' })}
        assistantName="通用助手"
        onFeedback={onApplied}
      />,
    );
    await user.click(screen.getByTestId('feedback-up'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const second = fetchMock.mock.calls[1]!;
    expect(JSON.parse((second[1] as RequestInit).body as string)).toEqual({ feedback: null });
    expect(onApplied).toHaveBeenLastCalledWith('m1', null, null);
  });

  it('用户图片消息：经带令牌 fetch 拉取 blob 并渲染缩略图', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <MessageItem
        message={makeMessage({
          role: 'user',
          content: '看图',
          contentParts: [{ type: 'image', attachmentId: 'att-9' }],
        })}
        assistantName="通用助手"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('message-image')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/attachments/att-9'),
      expect.anything(),
    );
  });
});
