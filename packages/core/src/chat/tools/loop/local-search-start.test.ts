import { describe, expect, it, vi } from 'vitest';
import type { Tool, ToolContext, ToolResult } from '../../../tools/types';
import type { OrchestratorEvent } from '../../base/types';
import type { ReadyToolCall, ToolStepContext } from './tool-call-step';
import { maybeStartLocalSearch } from './local-search-start';

const DOWN: ToolResult = {
  ok: false,
  output: '本地搜索服务（SearXNG）未运行：http://127.0.0.1:8080',
  summary: '本地搜索未运行',
  needsLocalSearchStart: { endpoint: 'http://127.0.0.1:8080' },
};

const UP: ToolResult = { ok: true, output: '搜索结果：1 条', summary: 'searxng · 1 条' };

function makeContext(options: {
  decision: 'allow' | 'deny';
  withConfirmations?: boolean;
  aborted?: boolean;
}): { ctx: ToolStepContext; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn().mockResolvedValue(options.decision);
  const confirmations = {
    request,
    resolve: vi.fn(),
    size: () => 0,
    clear: () => undefined,
  };
  const ctx = {
    toolCtx: { knowledgeBaseIds: [], retrieve: async () => [] } as unknown as ToolContext,
    deps: {
      db: {},
      cipher: {},
      ...(options.withConfirmations === false ? {} : { confirmations }),
    },
    signal: options.aborted ? AbortSignal.abort() : undefined,
    localSearchStarted: false,
  } as unknown as ToolStepContext;
  return { ctx, request };
}

function makePrepared(tool: Tool): ReadyToolCall {
  return {
    kind: 'ready',
    call: {
      id: 'call-search',
      type: 'function',
      function: { name: 'web_search', arguments: '{"query":"今日时事"}' },
    },
    args: { query: '今日时事' },
    tool,
    source: 'builtin',
    permission: 'read',
    argsSummary: '今日时事',
    startedAt: 0,
    countBudget: true,
    fetchUrl: null,
    skippedByDegrade: false,
  };
}

async function drain(
  gen: AsyncGenerator<OrchestratorEvent, ToolResult>,
): Promise<{ events: OrchestratorEvent[]; result: ToolResult }> {
  const events: OrchestratorEvent[] = [];
  let step = await gen.next();
  while (!step.done) {
    events.push(step.value);
    step = await gen.next();
  }
  return { events, result: step.value };
}

describe('maybeStartLocalSearch', () => {
  it('用户确认：先弹事件，启动成功后重试一次搜索', async () => {
    const run = vi.fn().mockResolvedValue(UP);
    const tool: Tool = { name: 'web_search', description: '', parameters: {}, run };
    const { ctx, request } = makeContext({ decision: 'allow' });
    const prepared = makePrepared(tool);
    const markStarted = vi.fn();

    const { events, result } = await drain(
      maybeStartLocalSearch({
        ctx,
        prepared,
        result: DOWN,
        alreadyStarted: () => ctx.localSearchStarted,
        markStarted,
      }),
    );

    expect(events).toEqual([
      {
        event: 'search_local_start_required',
        data: {
          callId: 'call-search',
          endpoint: 'http://127.0.0.1:8080',
          query: '今日时事',
        },
      },
    ]);
    expect(request).toHaveBeenCalledWith('call-search', undefined);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual(UP);
    expect(markStarted).toHaveBeenCalledTimes(1);
  });

  it('用户取消：不重试，回灌取消文案', async () => {
    const run = vi.fn().mockResolvedValue(DOWN);
    const tool: Tool = { name: 'web_search', description: '', parameters: {}, run };
    const { ctx } = makeContext({ decision: 'deny' });

    const { events, result } = await drain(
      maybeStartLocalSearch({
        ctx,
        prepared: makePrepared(tool),
        result: DOWN,
        alreadyStarted: () => ctx.localSearchStarted,
        markStarted: () => undefined,
      }),
    );

    expect(events).toHaveLength(1);
    expect(run).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('本地搜索未启动');
    expect(result.output).toContain('取消');
  });

  it('已启动过：后续并发调用直接重试，不再弹框', async () => {
    const run = vi.fn().mockResolvedValue(UP);
    const tool: Tool = { name: 'web_search', description: '', parameters: {}, run };
    const { ctx, request } = makeContext({ decision: 'allow' });

    const { events, result } = await drain(
      maybeStartLocalSearch({
        ctx,
        prepared: makePrepared(tool),
        result: DOWN,
        alreadyStarted: () => true,
        markStarted: () => undefined,
      }),
    );

    expect(events).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual(UP);
  });

  it('无确认通道或已中断：原样返回，不弹框', async () => {
    const run = vi.fn().mockResolvedValue(UP);
    const tool: Tool = { name: 'web_search', description: '', parameters: {}, run };

    for (const options of [{ decision: 'allow' as const, withConfirmations: false }, { decision: 'allow' as const, aborted: true }]) {
      const { ctx } = makeContext(options);
      const { events, result } = await drain(
        maybeStartLocalSearch({
          ctx,
          prepared: makePrepared(tool),
          result: DOWN,
          alreadyStarted: () => ctx.localSearchStarted,
          markStarted: () => undefined,
        }),
      );
      expect(events).toHaveLength(0);
      expect(result).toBe(DOWN);
    }
    expect(run).not.toHaveBeenCalled();
  });
});
