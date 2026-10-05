import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { decodeMessage, type JsonRpcResponse } from '../jsonrpc';
import { runMcpStdio } from './stdio-adapter';
import type { McpServerContext } from './mcp-server-core';

function createHarness(ctx: McpServerContext, expectedLines: number) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');
  const logs: string[] = [];
  const handle = runMcpStdio({ context: ctx, input, output, logger: (m) => logs.push(m) });
  let received = '';
  const done = new Promise<void>((resolve) => {
    output.on('data', (chunk: string) => {
      received += chunk;
      if (received.split('\n').filter(Boolean).length >= expectedLines) resolve();
    });
  });
  return {
    input,
    logs,
    handle,
    write(text: string) {
      input.write(text);
    },
    async responses(): Promise<JsonRpcResponse[]> {
      await done;
      return received
        .split('\n')
        .filter(Boolean)
        .map((line) => decodeMessage(line) as JsonRpcResponse);
    },
  };
}

describe('MCP stdio adapter（v0.9 M3）', () => {
  it('按行分帧：正常响应写 stdout；通知无响应；坏帧回 -32700；半包续传拼接', async () => {
    const ctx: McpServerContext = {
      serverInfo: { name: 't', version: '1' },
      listTools: async () => [],
      callTool: async () => null,
    };
    // ping + 坏帧 + 半包拼接的 ping = 3 个响应帧；initialized 通知无帧
    const h = createHarness(ctx, 3);
    h.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`);
    h.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    h.write('not-json\n');
    const splitAt = 10;
    const pingFrame = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' });
    h.write(pingFrame.slice(0, splitAt)); // 无换行：留在缓冲区
    h.write(`${pingFrame.slice(splitAt)}\n`);

    const responses = await h.responses();
    expect(responses).toHaveLength(3);
    expect(responses[0]!.result).toEqual({});
    expect(responses[1]!.error?.code).toBe(-32700);
    expect(responses[1]!.id).toBeNull();
    expect(responses[2]!.result).toEqual({});
    expect(h.logs).toEqual([]);
    h.handle.stop();
  });

  it('callTool 内部抛错被包成 -32603，不产生非协议输出', async () => {
    const ctx: McpServerContext = {
      serverInfo: { name: 't', version: '1' },
      listTools: async () => [],
      async callTool(name) {
        if (name === 'boom') throw new Error('boom in tool');
        return null;
      },
    };
    const h = createHarness(ctx, 1);
    h.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'boom', arguments: {} },
      })}\n`,
    );
    const responses = await h.responses();
    expect(responses[0]!.error?.code).toBe(-32603);
    expect(h.logs).toEqual([]);
    h.handle.stop();
  });
});
