// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecalledMemoryPayload } from '@wbfm/shared/api';
import { renderWithProviders } from '@/test/render';
import { RecalledMemoriesBar } from './recalled-memories-bar';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const memories: RecalledMemoryPayload[] = [
  {
    id: '1',
    kind: 'preference',
    content: '偏好中文回复',
    sourceConversationId: 'c1',
    sourceMessageId: 'm9',
    score: 0.91,
    reason: 'semantic',
  },
  {
    id: '2',
    kind: 'fact',
    content: '旧数据没有来源',
    sourceConversationId: null,
    sourceMessageId: null,
    score: 0.58,
    reason: 'semantic',
  },
];

describe('v2.6 M4 对话记忆 chips', () => {
  it('默认折叠只显示数量，展开后展示类别/理由/来源', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecalledMemoriesBar memories={memories} />);

    const toggle = screen.getByTestId('recalled-memories-toggle');
    expect(toggle).toHaveTextContent('本轮参考了 2 条长期记忆');
    expect(screen.queryAllByTestId('recalled-memory-item')).toHaveLength(0);

    await user.click(toggle);
    const items = screen.getAllByTestId('recalled-memory-item');
    expect(items).toHaveLength(2);

    expect(items[0]!).toHaveTextContent('偏好');
    expect(items[0]!).toHaveTextContent('语义召回 · 相关度高');
    const source = within(items[0]!).getByTestId('recalled-memory-source');
    expect(source).toHaveAttribute('href', '/chat?conversation=c1&message=m9');
    expect(source).toHaveTextContent('来源消息');

    expect(items[1]!).toHaveTextContent('语义召回 · 相关度中');
    expect(
      within(items[1]!).getByTestId('recalled-memory-source-unknown'),
    ).toHaveTextContent('来源未知');
  });

  it('无召回时不渲染', () => {
    const { container } = renderWithProviders(<RecalledMemoriesBar memories={[]} />);
    expect(container.querySelector('[data-testid="recalled-memories"]')).toBeNull();
  });
});
