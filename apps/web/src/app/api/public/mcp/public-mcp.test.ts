import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { POST as mcpPost } from './route';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'MCP-OK' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('公开 MCP HTTP 承载（v0.9 M3）', () => {
  let db: DatabaseInstance;
  let mcpKey: string;
  let httpOnlyKey: string;
  let toolName: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-mcp-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);

    const wf = workflows.createWorkflow({ name: 'MCP流程' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    mcpKey = services.endpoints.createOrUpdate(wf.id, {
      httpEnabled: false,
      mcpEnabled: true,
      syncTimeoutMs: 10_000,
      rateLimitPerMin: 30,
    }).plaintextKey!;
    toolName = `flow_${wf.id.replace(/-/g, '').slice(0, 8)}`;

    const wf2 = workflows.createWorkflow({ name: '仅HTTP' });
    workflows.addVersion(wf2.id, graph);
    workflows.publishVersion(wf2.id);
    httpOnlyKey = services.endpoints.createOrUpdate(wf2.id, {
      httpEnabled: true,
      mcpEnabled: false,
      syncTimeoutMs: 10_000,
      rateLimitPerMin: 30,
    }).plaintextKey!;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  async function rpc(body: unknown, key: string | null, init?: RequestInit) {
    return mcpPost(
      new Request('http://127.0.0.1:3000/api/public/mcp', {
        method: 'POST',
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(init?.headers ?? {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  }

  it('initialize/tools/list/tools/call 全链路；通知 204', async () => {
    let res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, mcpKey);
    expect(res.status).toBe(200);
    let payload = await res.json();
    expect(payload.result.protocolVersion).toBe('2025-06-18');
    expect(payload.result.capabilities.tools).toBeDefined();
    expect(payload.result.serverInfo.name).toBe('workbuddy-flow');

    res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, mcpKey);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');

    res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, mcpKey);
    payload = await res.json();
    expect(payload.result.tools).toHaveLength(1);
    expect(payload.result.tools[0].name).toBe(toolName);

    res = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: {} } }, mcpKey);
    payload = await res.json();
    expect(payload.result.content[0].text).toBe('MCP-OK');
    expect(payload.result.isError).toBeUndefined();
  });

  it('未知方法 -32601；坏参数 -32602；坏 JSON -32700', async () => {
    let res = await rpc({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, mcpKey);
    expect((await res.json()).error.code).toBe(-32601);

    res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} }, mcpKey);
    expect((await res.json()).error.code).toBe(-32602);

    res = await rpc('{bad json', mcpKey);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('鉴权：无密钥 401；仅开 HTTP 的密钥调 MCP 409 endpoint_disabled', async () => {
    const noAuth = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, null);
    expect(noAuth.status).toBe(401);

    const httpOnly = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, httpOnlyKey);
    expect(httpOnly.status).toBe(409);
    expect((await httpOnly.json()).error.code).toBe('endpoint_disabled');
  });
});
