import { describe, expect, it, vi } from 'vitest';
import type { ToolTraceEntry } from '@wbfm/shared';
import { runToolCallLoop, type ToolCallLoopParams } from './tool-call-loop';
import type { OrchestratorEvent } from './types';
import type { ToolRuntime, ResolvedTool } from '../tools/tool-runtime';
import type { Tool, ToolContext, ToolMap } from '../tools/types';
import type { ServiceDeps } from '../services/deps';
import type { ToolBreaker } from '../tools/tool-breaker';

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
    listDebugTools: () => [],
    createDebugToolContext: (signal) => ({ signal, knowledgeBaseId: null, retrieve: async () => [] }),
  };
}

function makeDeps(): ServiceDeps {
  return {
    db: {} as never,
  } as unknown as ServiceDeps;
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

  it('熔断：isTripped=true 时跳过执行，仅产出 end 事件与 error trace', async () => {
    const tool = makeFakeTool('fetch_webpage', 'danger');
    const runSpy = vi.spyOn(tool, 'run'); // 若误执行会暴露
    const resolved: ResolvedTool = { tool, source: 'builtin' };
    const runtime = makeRuntime(resolved);
    const toolMap: ToolMap = new Map([['fetch_webpage', tool]]);
    const trace: ToolTraceEntry[] = [];
    const outgoing: Parameters<typeof runToolCallLoop>[0]['outgoing'] = [];

    // 假熔断器：fetch_webpage 始终 trip，且记录任何调用都应失败
    const fakeBreaker: ToolBreaker = {
      isTripped: (name) => name === 'fetch_webpage',
      recordResult: () => {},
      reset: () => {},
      listTripped: () => [],
    };
    const deps: ServiceDeps = { ...makeDeps(), breakers: fakeBreaker };

    const params: ToolCallLoopParams = {
      calls: [
        { id: 'c1', type: 'function', function: { name: 'fetch_webpage', arguments: '{}' } },
      ],
      toolMap,
      toolCtx: { signal: undefined, knowledgeBaseId: null, retrieve: async () => [] },
      deps,
      runtime,
      assistantId: 'a1',
      turnTrace: null,
      trace,
      outgoing,
      citations: [],
      onAbort: () => {},
    };

    const events = await drain(runToolCallLoop(params));

    // 未执行实际工具
    expect(runSpy).not.toHaveBeenCalled();
    // 仅产出 end 事件（status=error，含 source/permission 与「已熔断」摘要）
    const toolEvents = events.filter((e) => e.event === 'tool');
    expect(toolEvents).toHaveLength(1);
    const endEv = toolEvents[0]!;
    expect((endEv.data as Record<string, unknown>).phase).toBe('end');
    expect((endEv.data as Record<string, unknown>).status).toBe('error');
    expect((endEv.data as Record<string, unknown>).resultSummary).toBe('已熔断');
    expect((endEv.data as Record<string, unknown>).source).toBe('builtin');
    expect((endEv.data as Record<string, unknown>).permission).toBe('danger');
    // trace 落一条 error
    expect(trace).toHaveLength(1);
    expect(trace[0]!.status).toBe('error');
    expect(trace[0]!.error).toBe('已熔断');
    // 出站回灌一条 tool 消息（含重置指引）
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]!.content).toContain('已熔断');
    expect(outgoing[0]!.content).toContain('fetch_webpage');
  });

  it('熔断：执行成功后调用 recordResult(true)；失败后 recordResult(false)', async () => {
    const okTool = makeFakeTool('current_time', 'read');
    const failTool: Tool = {
      ...makeFakeTool('fetch_webpage', 'danger'),
      run: async () => ({ ok: false, output: '失败', summary: '失败' }),
    };
    const recorded: Array<{ name: string; ok: boolean }> = [];
    const fakeBreaker: ToolBreaker = {
      isTripped: () => false,
      recordResult: (name, ok) => recorded.push({ name, ok }),
      reset: () => {},
      listTripped: () => [],
    };
    const deps: ServiceDeps = { ...makeDeps(), breakers: fakeBreaker };
    const runtime = makeRuntime({ tool: okTool, source: 'builtin' });
    const runtime2 = makeRuntime({ tool: failTool, source: 'builtin' });

    const baseParams = (name: string, runtime: ToolRuntime): ToolCallLoopParams => ({
      calls: [{ id: `c-${name}`, type: 'function', function: { name, arguments: '{}' } }],
      toolMap: new Map([[name, name === 'current_time' ? okTool : failTool]]),
      toolCtx: { signal: undefined, knowledgeBaseId: null, retrieve: async () => [] },
      deps,
      runtime,
      assistantId: 'a1',
      turnTrace: null,
      trace: [],
      outgoing: [],
      citations: [],
      onAbort: () => {},
    });

    await drain(runToolCallLoop(baseParams('current_time', runtime)));
    await drain(runToolCallLoop(baseParams('fetch_webpage', runtime2)));

    expect(recorded).toEqual([
      { name: 'current_time', ok: true },
      { name: 'fetch_webpage', ok: false },
    ]);
  });
});
