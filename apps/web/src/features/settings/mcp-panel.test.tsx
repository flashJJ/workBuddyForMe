// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { McpServerInfo } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { McpPanel } from './mcp-panel';

function makeServer(partial: Partial<McpServerInfo> & { id: string; name: string }): McpServerInfo {
  return {
    transport: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    url: '',
    headers: {},
    enabled: true,
    status: 'connected',
    statusDetail: null,
    toolCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MCP 服务器面板（v0.6 M1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('列表：状态徽章、命令摘要与工具数展示', async () => {
    fetchMock.mockResolvedValue(
      ok([
        makeServer({
          id: '1',
          name: 'filesystem',
          args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
          toolCount: 11,
        }),
        makeServer({ id: '2', name: 'broken', status: 'error', statusDetail: '进程退出（code=1）' }),
      ]),
    );
    renderWithProviders(<McpPanel />);

    const list = await screen.findByTestId('mcp-server-list');
    const items = within(list).getAllByTestId('mcp-server-item');
    expect(items).toHaveLength(2);
    expect(list.textContent).toContain('已连接');
    expect(list.textContent).toContain('连接失败');
    expect(list.textContent).toContain('11 个工具');
    expect(list.textContent).toContain('@modelcontextprotocol/server-filesystem');
    expect(list.textContent).toContain('进程退出（code=1）');
  });

  it('空状态与添加入口', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const user = userEvent.setup();
    renderWithProviders(<McpPanel />);
    await screen.findByText(/还没有 MCP 服务器/);

    await user.click(screen.getByRole('button', { name: '添加服务器' }));
    expect(await screen.findByText('添加 MCP 服务器')).toBeInTheDocument();
  });

  it('添加：args 每行一个参数、env 每行 KEY=VALUE，POST stdio 配置', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const user = userEvent.setup();
    renderWithProviders(<McpPanel />);

    await user.click(screen.getByRole('button', { name: '添加服务器' }));
    await screen.findByText('添加 MCP 服务器');
    await user.type(screen.getByLabelText(/名称/), 'filesystem');
    await user.type(screen.getByLabelText('启动命令'), 'npx');
    await user.type(screen.getByLabelText(/启动参数/), '-y\n@modelcontextprotocol/server-filesystem');
    await user.type(screen.getByLabelText(/环境变量/), 'API_KEY=abc');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith('/api/mcp/servers') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toEqual({
        transport: 'stdio',
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { API_KEY: 'abc' },
        enabled: true,
      });
    });
  });

  it('停用：勾选取消后 PATCH enabled=false', async () => {
    fetchMock.mockResolvedValue(ok([makeServer({ id: '1', name: 'filesystem' })]));
    const user = userEvent.setup();
    renderWithProviders(<McpPanel />);
    const item = (await screen.findAllByTestId('mcp-server-item'))[0]!;
    await user.click(within(item).getByRole('checkbox'));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith('/api/mcp/servers/1') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeTruthy();
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
        transport: 'stdio',
        enabled: false,
      });
    });
  });

  it('删除：confirm 后 DELETE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValue(ok([makeServer({ id: '1', name: 'filesystem' })]));
    const user = userEvent.setup();
    renderWithProviders(<McpPanel />);
    const item = (await screen.findAllByTestId('mcp-server-item'))[0]!;
    await user.click(within(item).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) =>
        String(input).endsWith('/api/mcp/servers/1') &&
        (init as RequestInit | undefined)?.method === 'DELETE',
      )).toBe(true);
    });
  });

  it('删除：confirm 取消则不发起请求', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fetchMock.mockResolvedValue(ok([makeServer({ id: '1', name: 'filesystem' })]));
    const user = userEvent.setup();
    renderWithProviders(<McpPanel />);
    const item = (await screen.findAllByTestId('mcp-server-item'))[0]!;
    await user.click(within(item).getByRole('button', { name: '删除' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });
});
