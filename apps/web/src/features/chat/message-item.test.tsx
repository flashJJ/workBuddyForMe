// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@wbfm/shared';
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
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    errorCode: null,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('消息项 MessageItem（TR-27.1）', () => {
  afterEach(() => vi.restoreAllMocks());

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
        previousUserContent="再讲一次"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('message-error')).toHaveTextContent('上游 500');
    await user.click(screen.getByRole('button', { name: '重新生成' }));
    expect(onRetry).toHaveBeenCalledWith('再讲一次');
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
});
