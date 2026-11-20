import { describe, expect, it } from 'vitest';
import { createMcpClient } from '../client';
import type { StdioTransport } from '../stdio-transport';

type Responder = (method: string, params: unknown) => unknown;

function fakeTransport(respond: Responder) {
  const requests: Array<{ method: string; params: unknown }> = [];
  const transport = {
    setMessageHandler: () => undefined,
    request: async (method: string, params: unknown) => {
      requests.push({ method, params });
      return { jsonrpc: '2.0', id: requests.length, result: respond(method, params) } as never;
    },
    notify: () => undefined,
    respond: () => undefined,
    respondError: () => undefined,
    isAlive: () => true,
    stop: async () => undefined,
  } as unknown as StdioTransport;
  return { transport, requests };
}

describe('MCP 客户端协议边界', () => {
  it('点号工具名：对外净化唯一，调用时还原服务器真实名', async () => {
    const { transport, requests } = fakeTransport((method) => {
      if (method === 'tools/list') {
        return {
          tools: [
            { name: 'git.status', description: '', inputSchema: { type: 'object' } },
            { name: 'git_status', description: '', inputSchema: { type: 'object' } },
          ],
        };
      }
      return { content: [{ type: 'text', text: 'ok' }], isError: false };
    });
    const client = createMcpClient({ transport });
    const tools = await client.listTools('srv');
    // 冲突净化名追加后缀，避免两个工具共用一个 qualifiedName
    expect(tools.map((tool) => tool.name)).toEqual(['git_status', 'git_status_2']);

    await client.callTool('git_status', {}, 1000);
    expect((requests.at(-1)!.params as { name: string }).name).toBe('git.status');
    await client.callTool('git_status_2', {}, 1000);
    expect((requests.at(-1)!.params as { name: string }).name).toBe('git_status');
  });

  it('服务器重复返回同一 nextCursor 时终止翻页', async () => {
    const { transport, requests } = fakeTransport(() => ({ tools: [], nextCursor: 'same' }));
    const client = createMcpClient({ transport });
    const tools = await client.listTools('srv');
    expect(tools).toEqual([]);
    expect(requests).toHaveLength(2);
  });
});
