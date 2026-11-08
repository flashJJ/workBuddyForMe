// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Memory } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { MemoryPanel } from './memory-panel';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeMemory(partial: Partial<Memory> & { id: string; content: string }): Memory {
  return {
    kind: 'fact',
    importance: 0.5,
    sourceConversationId: null,
    sourceMessageId: null,
    recallCount: 0,
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    lastAccessedAt: null,
    scope: 'global',
    assistantId: null,
    source: 'legacy',
    pinned: false,
    confidence: 1,
    subjectKey: null,
    version: 1,
    supersededBy: null,
    validFrom: null,
    validTo: null,
    ttlAt: null,
    lastConfirmedAt: null,
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const EMPTY_STATS = {
  total: 0,
  active: 0,
  archived: 0,
  superseded: 0,
  supersededRatio: 0,
  recallTotal: 0,
  zeroRecallRate: 0,
  userCorrections: 0,
  recentEvents: [],
};

describe('长期记忆管理面板（M4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** 面板同时拉列表与统计：统计固定返回空口径，其余走用例自己的桩（每次新建 Response） */
  function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === '/api/memories/stats' ? ok(EMPTY_STATS) : handler(url, init),
    );
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('列出记忆：类别徽标、重要性与内容正确展示', async () => {
    mockFetch(() =>
      ok([
        makeMemory({ id: '1', kind: 'preference', content: '偏好中文回复', importance: 0.9 }),
        makeMemory({ id: '2', kind: 'event', content: '下周搬家', status: 'archived' }),
      ]),
    );
    renderWithProviders(<MemoryPanel />);

    const list = await screen.findByTestId('memory-list');
    expect(within(list).getAllByTestId('memory-item')).toHaveLength(2);
    expect(list.textContent).toContain('偏好中文回复');
    expect(list.textContent).toContain('偏好');
    expect(list.textContent).toContain('已归档');
  });

  it('空库展示空状态', async () => {
    mockFetch(() => ok([]));
    renderWithProviders(<MemoryPanel />);
    expect(await screen.findByText('还没有记忆')).toBeInTheDocument();
  });

  it('搜索框输入后以 search 查询参数重新拉取', async () => {
    mockFetch(() => ok([]));
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);
    await screen.findByText('还没有记忆');

    await user.type(screen.getByLabelText('搜索记忆'), 'PMP');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('search=PMP'),
        expect.anything(),
      ),
    );
  });

  it('时间线筛选：选择起止日期后带 from/to 参数拉取', async () => {
    mockFetch(() => ok([]));
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);
    await screen.findByText('还没有记忆');

    await user.type(screen.getByLabelText('起始日期'), '2026-01-01');
    await user.type(screen.getByLabelText('截止日期'), '2026-03-31');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/from=2026-01-01.*to=2026-03-31|to=2026-03-31.*from=2026-01-01/),
        expect.anything(),
      ),
    );
  });

  it('添加记忆：默认 fact/0.5，POST 后关闭弹窗', async () => {
    mockFetch(async (url, init) => {
      if (url === '/api/memories' && init?.method === 'POST') return ok(makeMemory({ id: '9', content: '用户在杭州工作' }), 201);
      return ok([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);

    await user.click(await screen.findByRole('button', { name: '添加记忆' }));
    await user.type(screen.getByLabelText('记忆内容'), '用户在杭州工作');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/memories', expect.anything()),
    );
    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/memories' && (call[1] as RequestInit).method === 'POST',
    );
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      kind: 'fact',
      content: '用户在杭州工作',
      importance: 0.5,
    });
  });

  it('删除单条：confirm 后发 DELETE', async () => {
    mockFetch(async (url) => {
      if (url.startsWith('/api/memories/1')) return ok({ id: '1', deleted: true });
      return ok([makeMemory({ id: '1', content: '一条记忆' })]);
    });
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);

    await user.click(await screen.findByTestId('memory-delete'));
    // v1.2：window.confirm 已替换为应用内 ConfirmDialog
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('删除记忆');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/memories/1', expect.anything()),
    );
  });

  it('全部清空：confirm 后调用 clear 端点并回报删除条数', async () => {
    mockFetch(async (url) => {
      if (url === '/api/memories/clear') return ok({ removed: 3 });
      return ok([makeMemory({ id: '1', content: '记忆' })]);
    });
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);

    await user.click(await screen.findByTestId('memory-clear'));
    // v1.2：清空确认使用应用内 ConfirmDialog
    const clearDialog = await screen.findByRole('dialog');
    expect(clearDialog).toHaveTextContent('清空全部记忆');
    await user.click(within(clearDialog).getByRole('button', { name: '全部清空' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/memories/clear', expect.anything()),
    );
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/memories/clear');
    expect((call![1] as RequestInit).method).toBe('POST');
  });

  it('v2.6 溯源：来源消息链接、召回次数与来源未知降级', async () => {
    mockFetch(() =>
      ok([
        makeMemory({
          id: '1',
          content: '偏好中文',
          sourceConversationId: 'c1',
          sourceMessageId: 'm9',
          recallCount: 3,
          lastAccessedAt: '2026-10-01T00:00:00.000Z',
        }),
        makeMemory({ id: '2', content: '旧记忆' }),
      ]),
    );
    renderWithProviders(<MemoryPanel />);

    const items = within(await screen.findByTestId('memory-list')).getAllByTestId('memory-item');
    expect(items[0]!).toHaveTextContent('已召回 3 次');
    expect(items[0]!).toHaveTextContent('最近召回');
    const link = within(items[0]!).getByTestId('memory-source-link');
    expect(link).toHaveAttribute('href', '/chat?conversation=c1&message=m9');
    expect(link).toHaveTextContent('来源消息');
    expect(within(items[1]!).getByTestId('memory-source-unknown')).toHaveTextContent('来源未知');
    expect(items[1]!).toHaveTextContent('尚未召回');
  });
});
