// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { GlobalSearchDialog } from './global-search-dialog';

const { chatHit, taskHit, knowledgeHit, groups, setQuery, copyText } = vi.hoisted(() => {
  const setQuery = () => undefined;
  const copyText = vi.fn();
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
  const knowledgeHit = {
    domain: 'knowledge' as const,
    id: 'd1',
    title: '青鸟计划.md',
    snippet: '.md · indexed',
    timestamp: '2026-11-22T00:02:00.000Z',
    deepLink: '/knowledge?kb=kb1',
    action: 'open' as const,
  };
  return {
    chatHit,
    taskHit,
    knowledgeHit,
    setQuery,
    copyText,
    groups: [
      { domain: 'chat' as const, hits: [chatHit] },
      { domain: 'task' as const, hits: [taskHit] },
      { domain: 'knowledge' as const, hits: [knowledgeHit] },
    ],
  };
});

vi.mock('@/lib/utils/clipboard', () => ({ copyText }));

vi.mock('./use-global-search', () => ({
  useGlobalSearch: () => ({
    query: '青鸟',
    setQuery,
    groups,
    failedDomains: ['meeting'],
    loading: false,
  }),
}));

describe('v4.18 全局检索弹层', () => {
  beforeEach(() => {
    copyText.mockReset();
    copyText.mockResolvedValue(undefined);
  });

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

  it('知识结果复制引用：只复制标题与深链，弹层保持打开', async () => {
    const onOpenChange = vi.fn();
    render(
      <I18nProvider skipHydration>
        <GlobalSearchDialog open onOpenChange={onOpenChange} onOpenHit={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('global-search-copy-knowledge'));

    await waitFor(() =>
      expect(copyText).toHaveBeenCalledWith('青鸟计划.md — /knowledge?kb=kb1'),
    );
    expect(await screen.findByTestId('global-search-copy-status')).toHaveTextContent('已复制引用');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument();
  });

  it('复制失败只做内联提示，不阻断弹层', async () => {
    copyText.mockRejectedValueOnce(new Error('denied'));
    render(
      <I18nProvider skipHydration>
        <GlobalSearchDialog open onOpenChange={vi.fn()} onOpenHit={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('global-search-copy-knowledge'));

    expect(await screen.findByTestId('global-search-copy-status')).toHaveTextContent('复制失败');
    expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument();
  });
});
