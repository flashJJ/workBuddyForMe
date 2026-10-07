import { beforeEach, describe, expect, it } from 'vitest';
import { JSON_RPC_ERRORS } from '../jsonrpc';
import {
  handleMcpMessage,
  McpInvalidParamsError,
  type McpCallResult,
  type McpServerContext,
} from './mcp-server-core';
import { buildFlowMcpName, describeFlowAsMcpTool, ensureUniqueToolNames } from './describe-tool';
import type { FlowGraph, WorkflowView } from '@wbfm/shared';

const graphWithInput: FlowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 0, y: 0 },
      config: { inputs: [{ name: 'url', type: 'string', required: true }] },
    },
    { id: 'end', type: 'end', position: { x: 1, y: 1 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

const workflow: WorkflowView = {
  id: 'a1b2c3d4-1111-2222-3333-444455556666',
  name: '摘要器',
  description: '网页摘要',
  icon: 'workflow',
  color: 'default',
  status: 'published',
  currentVersion: 1,
  createdAt: '',
  updatedAt: '',
};

describe('MCP 描述符（v0.9 M3）', () => {
  it('工具名 flow_ + id 前 8 位；inputSchema 与 start 字段同源', () => {
    expect(buildFlowMcpName(workflow.id)).toBe('flow_a1b2c3d4');
    const tool = describeFlowAsMcpTool(workflow, graphWithInput);
    expect(tool.name).toBe('flow_a1b2c3d4');
    expect(tool.description).toBe('网页摘要');
    expect(tool.inputSchema.required).toEqual(['url']);
    expect((tool.inputSchema.properties as { url: unknown }).url).toBeTruthy();
  });

  it('短码碰撞时追加位保证唯一', () => {
    const a = describeFlowAsMcpTool({ ...workflow }, graphWithInput);
    const b = describeFlowAsMcpTool(
      { ...workflow, id: 'a1b2c3d4-9999-9999-9999-999999999999' },
      graphWithInput,
    );
    const unique = ensureUniqueToolNames([a, b]);
    expect(new Set(unique.map((t) => t.name)).size).toBe(2);
    expect(unique[0]!.name).toBe('flow_a1b2c3d4');
    expect(unique[1]!.name).toBe('flow_a1b2c3d499');
  });
});

describe('handleMcpMessage（v0.9 M3）', () => {
  let calls: Array<{ name: string; args: Record<string, unknown> }>;
  let ctx: McpServerContext;

  beforeEach(() => {
    calls = [];
    ctx = {
      serverInfo: { name: 'workbuddy-flow', version: '1.0.0' },
      listTools: async () => [describeFlowAsMcpTool(workflow, graphWithInput)],
      async callTool(name, args): Promise<McpCallResult | null> {
        calls.push({ name, args });
        if (name === 'flow_a1b2c3d4') {
          if ((args as { bad?: boolean }).bad) {
            throw new McpInvalidParamsError([{ path: 'url', message: '必填' }]);
          }
          return { content: [{ type: 'text', text: 'OUT' }] };
        }
        return null;
      },
    };
  });

  const req = (method: string, params?: unknown, id: string | number = 1) =>
    handleMcpMessage({ jsonrpc: '2.0', id, method, params }, ctx);

  it('initialize：协商协议版本并返回 tools 能力与 serverInfo', async () => {
    const ok = await req('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    expect(ok?.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'workbuddy-flow', version: '1.0.0' },
    });
    // 未知版本回落服务端版本
    const fallback = await req('initialize', { protocolVersion: '1999-01-01' });
    expect(fallback?.result).toMatchObject({ protocolVersion: '2025-06-18' });
  });

  it('notifications/initialized 不产生响应；ping 返回空对象', async () => {
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull();
    expect((await req('ping'))?.result).toEqual({});
  });

  it('tools/list：返回工具且剥离 workflowId，无 nextCursor', async () => {
    const res = await req('tools/list');
    const result = res?.result as { tools: Array<Record<string, unknown>> };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe('flow_a1b2c3d4');
    expect('workflowId' in result.tools[0]!).toBe(false);
    expect('nextCursor' in result).toBe(false);
  });

  it('tools/call：成功 content；未知工具 -32602；坏参数结构 -32602；入参校验错误带 details', async () => {
    const ok = await req('tools/call', { name: 'flow_a1b2c3d4', arguments: { url: 'x' } });
    expect(ok?.result).toEqual({ content: [{ type: 'text', text: 'OUT' }] });

    const unknown = await req('tools/call', { name: 'nope', arguments: {} });
    expect(unknown?.error?.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);

    const badShape = await req('tools/call', { arguments: {} });
    expect(badShape?.error?.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);

    const badArgs = await req('tools/call', { name: 'flow_a1b2c3d4', arguments: { bad: true } });
    expect(badArgs?.error?.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
    expect(badArgs?.error?.data).toEqual([{ path: 'url', message: '必填' }]);
  });

  it('未知方法 -32601', async () => {
    const res = await req('resources/list');
    expect(res?.error?.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });
});
