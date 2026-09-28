import { describe, expect, it, vi } from 'vitest';
import type { ToolTraceEntry } from '@wbfm/shared';
import { runToolCallLoop, type ToolCallLoopParams } from './tool-call-loop';
import type { OrchestratorEvent } from './types';
import type { ToolRuntime, ResolvedTool } from '../tools/tool-runtime';
import type { Tool, ToolContext, ToolMap } from '../tools/types';
import type { ServiceDeps } from '../services/deps';

/** 假内置工具：read 权限，总是成功 */
function makeFakeTool(name: string, permission: 'read' | 'write' | 'danger' = 'read'): Tool {
  return {
    name,
    description: `假工具 ${name}`,
    parameters: { type: 'object', properties: {} },
    permission,
    run: async () => ({ ok: true, output: 'done', summary: '成功' }),
  };
}

function makeRuntime(resolved: ResolvedTool | null): ToolRuntime {
  return {
    resolveTool: () => resolved,
    buildTools: () => new Map(),
    createContext: () => ({ signal: undefined, knowledgeBaseId: null, retrieve: async () => [] }),
  };
}

function makeDeps(): ServiceDeps {
  return {
    db: {} as never,
  } as ServiceDeps;
}

async function drain(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('tool-call-loop 可观测性（v0.6 M4）', () => {
  it('start/end SSE 事件与 trace 含 source + permission', async () => {
    const tool = makeFakeTool('current_time', 'read');
    const resolved: ResolvedTool = { tool, source: 'builtin' };
    const runtime = makeRuntime(resolved);
    const toolMap: ToolMap = new Map([['current_time', tool]]);
    const ctx: ToolContext = { signal: undefined, knowledgeBaseId: null, retrieve: async () => [] };
    const trace: ToolTraceEntry[] = [];
    const outgoing: Parameters<typeof runToolCallLoop>[0]['outgoing'] = [];

    const params: ToolCallLoopParams = {
      calls: [{ id: 'c1', type: 'function', function: { name: 'current_time', arguments: '{}' } }],
      toolMap,
      toolCtx: ctx,
      deps: makeDeps(),
      runtime,
      assistantId: 'a1',
      turnTrace: null,
      trace,
      outgoing,
      citations: [],
      onAbort: () => {},
    };

    const events = await drain(runToolCallLoop(params));

    const startEv = events.find((e) => e.event === 'tool' && (e.data as { phase: string }).phase === 'start');
    expect(startEv).toBeTruthy();
    expect((startEv!.data as Record<string, unknown>).source).toBe('builtin');
    expect((startEv!.data as Record<string, unknown>).permission).toBe('read');

    const endEv = events.find((e) => e.event === 'tool' && (e.data as { phase: string }).phase === 'end');
    expect(endEv).toBeTruthy();
    expect((endEv!.data as Record<string, unknown>).source).toBe('builtin');
    expect((endEv!.data as Record<string, unknown>).permission).toBe('read');

    expect(trace[0]!.source).toBe('builtin');
    expect(trace[0]!.permission).toBe('read');
  });

  it('未知工具名 source 为 unknown、permission 回退 read', async () => {
    const runtime = makeRuntime(null); // resolveTool 返回 null
    const params: ToolCallLoopParams = {
      calls: [{ id: 'c1', type: 'function', function: { name: 'no_such_tool', arguments: '{}' } }],
      toolMap: new Map(),
      toolCtx: { signal: undefined, knowledgeBaseId: null, retrieve: async () => [] },
      deps: makeDeps(),
      runtime,
      assistantId: 'a1',
      turnTrace: null,
      trace: [],
      outgoing: [],
      citations: [],
      onAbort: () => {},
    };

    const events = await drain(runToolCallLoop(params));
    const startEv = events.find((e) => e.event === 'tool' && (e.data as { phase: string }).phase === 'start');
    expect((startEv!.data as Record<string, unknown>).source).toBe('unknown');
    expect((startEv!.data as Record<string, unknown>).permission).toBe('read');
  });
});
