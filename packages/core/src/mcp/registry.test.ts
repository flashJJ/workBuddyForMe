import { describe, expect, it, vi } from 'vitest';
import type { McpServerConfig, McpToolInfo } from '@wbfm/shared';
import { buildMcpToolName } from '@wbfm/shared';
import { createDatabase } from '@wbfm/database';
import { createMcpServerRepository } from '@wbfm/database';
import { createMcpRegistry } from './registry';
import type { McpClient } from './client';

function makeFakeClient(overrides: Partial<McpClient> = {}): McpClient {
  return {
    initialize: vi.fn(async () => ({ protocolVersion: '2025-06-18', serverInfo: { name: 'fake' } })),
    listTools: vi.fn(async (serverName: string) => [
      {
        serverName,
        name: 'search_files',
        qualifiedName: buildMcpToolName(serverName, 'search_files'),
        description: '搜索文件',
        inputSchema: { type: 'object', properties: {} },
      },
    ]),
    callTool: vi.fn(async () => ({ ok: true, output: 'done', isError: false })),
    handleMessage: vi.fn(),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createStdioServer(name: string, enabled = true): McpServerConfig {
  return {
    id: `id-${name}`,
    transport: 'stdio',
    name,
    command: 'node',
    args: ['server.mjs'],
    env: {},
    url: '',
    headers: {},
    enabled,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function setupRegistry(servers: McpServerConfig[], client: McpClient) {
  const db = createDatabase();
  const repo = createMcpServerRepository(db);
  for (const server of servers) repo.create(server);
  const registry = createMcpRegistry(db, { clientFactory: () => client });
  registry.reconcile();
  // 连接是异步发起的：等待状态收敛
  await vi.waitFor(() => {
    const infos = registry.getServerInfos();
    if (infos.some((info) => info.status === 'connecting')) throw new Error('still connecting');
  });
  return { registry, repo, db };
}

describe('MCP 注册表（注入客户端）', () => {
  it('enabled 服务器自动连接并发现工具；infos 携带状态与工具数', async () => {
    const client = makeFakeClient();
    const { registry } = await setupRegistry([createStdioServer('fs')], client);
    const infos = registry.getServerInfos();
    expect(infos).toHaveLength(1);
    expect(infos[0]?.status).toBe('connected');
    expect(infos[0]?.toolCount).toBe(1);

    const tools = registry.getTools();
    expect(tools).toEqual([
      expect.objectContaining({
        serverName: 'fs',
        qualifiedName: 'mcp:fs:search_files',
      }),
    ]);
  });

  it('禁用后 reconcile 断开：状态回 disconnected，工具清空', async () => {
    const client = makeFakeClient();
    const { registry, repo } = await setupRegistry([createStdioServer('fs')], client);
    const serverId = createStdioServer('fs').id;
    repo.update(serverId, { enabled: false });
    registry.reconcile();
    await vi.waitFor(() => {
      if (registry.getServerInfos()[0]?.status !== 'disconnected') {
        throw new Error('not disconnected yet');
      }
    });
    expect(registry.getTools()).toEqual([]);
    expect(client.close).toHaveBeenCalled();
  });

  it('握手失败标记 error 并携带原因；callTool 对未连接服务器返回 null', async () => {
    const client = makeFakeClient({
      initialize: vi.fn(async () => {
        throw new Error('spawn 失败：命令不存在');
      }),
    });
    const { registry } = await setupRegistry([createStdioServer('bad')], client);
    const info = registry.getServerInfos()[0];
    expect(info?.status).toBe('error');
    expect(info?.statusDetail).toContain('spawn 失败');
    expect(registry.getTools()).toEqual([]);
    await expect(registry.callTool('mcp:bad:search_files', {}, 1000)).resolves.toBeNull();
  });

  it('callTool 按限定名路由到对应服务器客户端', async () => {
    const client = makeFakeClient();
    const { registry } = await setupRegistry([createStdioServer('fs')], client);
    const result = await registry.callTool('mcp:fs:search_files', { query: '周报' }, 1000);
    expect(result).toEqual({ ok: true, output: 'done' });
    expect(client.callTool).toHaveBeenCalledWith('search_files', { query: '周报' }, 1000);
  });

  it('disconnectAll 关闭全部客户端', async () => {
    const client = makeFakeClient();
    const { registry } = await setupRegistry(
      [createStdioServer('a'), createStdioServer('b')],
      client,
    );
    await registry.disconnectAll();
    expect(client.close).toHaveBeenCalledTimes(2);
    expect(registry.getServerInfos().every((info) => info.status === 'disconnected')).toBe(true);
  });
});
