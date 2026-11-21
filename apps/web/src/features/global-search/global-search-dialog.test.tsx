// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { GlobalSearchDialog } from './global-search-dialog';

const { chatHit, taskHit, groups } = vi.hoisted(() => {
  const chatHit = {
    domain: 'chat' as const,
    id: 'm1',
    title: '接口版本 v2.3',
    snippet: '超时 8000 毫秒',
    timestamp: '2026-11-22T00:00:00.000Z',
    deepLink: '/chat?conversation=c1&message=m1',
    action: 'open' as const,
  };
  const taskHit = {
    domain: 'task' as const,
    id: 'run-1',
    title: '整理三份文档',
    snippet: '运行开始',
    timestamp: '2026-11-22T00:01:00.000Z',
    deepLink: '/timeline?scope=task&id=run-1',
    action: 'open' as const,
  };
  return {
    chatHit,
    taskHit,
    groups: [
      { domain: 'chat' as const, hits: [chatHit] },
      { domain: 'task' as const, hits: [taskHit] },
    ],
  };
});

vi.mock('./use-global-search', () => ({
  useGlobalSearch: () => ({
    query: '青鸟',
    setQuery: vi.fn(),
    groups,
    failedDomains: ['meeting'],
    loading: false,
  }),
}));

describe('v4.18 全局检索弹层', () => {
  it('分组展示、失败域提示，键盘上下选择后回车打开', async () => {
    const onOpenHit = vi.fn();
    render(
      <I18nProvider skipHydration>
        <GlobalSearchDialog open onOpenChange={vi.fn()} onOpenHit={onOpenHit} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('global-search-group-chat')).toBeInTheDocument();
    expect(screen.getByTestId('global-search-group-task')).toBeInTheDocument();
    expect(screen.getByTestId('global-search-failed')).toHaveTextContent('会议');

    const dialog = screen.getByTestId('global-search-dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onOpenHit).toHaveBeenCalledWith(taskHit);
  });
});
