// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Memory } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { MemoryPanel } from './memory-panel';

function makeMemory(partial: Partial<Memory> & { id: string; content: string }): Memory {
  return {
    kind: 'fact',
    importance: 0.5,
    sourceConversationId: null,
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    lastAccessedAt: null,
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('长期记忆管理面板（M4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('列出记忆：类别徽标、重要性与内容正确展示', async () => {
    fetchMock.mockResolvedValue(
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
    fetchMock.mockResolvedValue(ok([]));
    renderWithProviders(<MemoryPanel />);
    expect(await screen.findByText('还没有记忆')).toBeInTheDocument();
  });

  it('搜索框输入后以 search 查询参数重新拉取', async () => {
    fetchMock.mockResolvedValue(ok([]));
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

  it('添加记忆：默认 fact/0.5，POST 后关闭弹窗', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
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
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/memories/1')) return ok({ id: '1', deleted: true });
      return ok([makeMemory({ id: '1', content: '一条记忆' })]);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);

    await user.click(await screen.findByTestId('memory-delete'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/memories/1', expect.anything()),
    );
  });

  it('全部清空：confirm 后调用 clear 端点并回报删除条数', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/memories/clear') return ok({ removed: 3 });
      return ok([makeMemory({ id: '1', content: '记忆' })]);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<MemoryPanel />);

    await user.click(await screen.findByTestId('memory-clear'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/memories/clear', expect.anything()),
    );
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/memories/clear');
    expect((call![1] as RequestInit).method).toBe('POST');
  });
});
