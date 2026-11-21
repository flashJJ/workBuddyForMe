// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const searchState = vi.hoisted(() => ({
  query: '',
  hits: [] as unknown[],
}));

vi.mock('./use-message-search', () => ({
  useMessageSearch: () => ({
    query: searchState.query,
    setQuery: vi.fn(),
    hits: searchState.hits,
    loading: false,
    failed: false,
  }),
}));

import { MessageSearchDialog } from './message-search-dialog';

function renderDialog(onOpenHit = vi.fn()) {
  render(
    <I18nProvider skipHydration>
      <MessageSearchDialog open onOpenChange={() => undefined} onOpenHit={onOpenHit} />
    </I18nProvider>,
  );
  return onOpenHit;
}

describe('消息检索（v4.17）', () => {
  it('输入关键词后展示命中并携带会话与消息 id 打开', () => {
    searchState.query = '风险项';
    searchState.hits = [
      {
        id: 'evt-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        role: 'assistant',
        snippet: '周报里的风险项要单独列出',
        createdAt: '2026-11-21T10:00:00.000Z',
      },
    ];
    const onOpenHit = renderDialog();
    fireEvent.click(screen.getByText(/周报里的风险项/));

    expect(onOpenHit).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', messageId: 'msg-1' }),
    );
  });

  it('无命中时给出换关键词引导', () => {
    searchState.query = '不存在的词';
    searchState.hits = [];
    renderDialog();
    expect(screen.getByText('没有找到匹配内容')).toBeInTheDocument();
  });
});
