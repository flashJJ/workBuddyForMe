import { describe, expect, it } from 'vitest';
import type { ToolCall } from '@wbfm/ai';
import type { ToolTraceEntry } from '@wbfm/shared';
import { runToolCallLoop } from './tool-call-loop';
import type { OrchestratorEvent } from './types';
import type { Tool, ToolContext, ToolMap, ToolResult } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { ServiceDeps } from '../services/deps';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('runToolCallLoop：v0.8 flow 工具子步骤', () => {
  it('onSubstep 回调转 tool/substep SSE 事件，终态快照落入 trace 与 end 事件', async () => {
    const flowTool: Tool = {
      name: 'flow:wf-1',
      description: '工作流工具',
      parameters: { type: 'object' },
      permission: 'read',
      async run(_args, ctx: ToolContext): Promise<ToolResult> {
        ctx.onSubstep?.({ id: 'start', label: '开始', status: 'running' });
        ctx.onSubstep?.({ id: 'start', label: '开始', status: 'ok' });
        ctx.onSubstep?.({ id: 'llm', label: '大模型', status: 'running' });
        ctx.onSubstep?.({ id: 'llm', label: '大模型', status: 'ok', detail: '生成完成' });
        return {
          ok: true,
          output: '流程结果文本',
          summary: '工作流「测试」执行完成',
          substeps: [
            { id: 'start', label: '开始', status: 'ok' },
            { id: 'llm', label: '大模型', status: 'ok', detail: '生成完成' },
          ],
        };
      },
    };

    const toolMap: ToolMap = new Map([[flowTool.name, flowTool]]);
    const runtime = {
      resolveTool: (name: string) =>
        name === flowTool.name ? { tool: flowTool, source: 'flow' } : null,
    } as unknown as ToolRuntime;
    const calls: ToolCall[] = [
      { id: 'call-1', type: 'function' as const, function: { name: flowTool.name, arguments: '{}' } },
    ];

    const trace: ToolTraceEntry[] = [];
    const events = await drain(
      runToolCallLoop({
        calls,
        toolMap,
        toolCtx: { knowledgeBaseId: null, retrieve: async () => [] },
        deps: {} as ServiceDeps,
        runtime,
        assistantId: 'a1',
        turnTrace: null,
        trace,
        outgoing: [],
        citations: [],
        toolMessageBudgetTokens: 1024,
        onAbort: () => undefined,
      }),
    );

    const toolEvents = events.filter((e) => e.event === 'tool');
    expect(toolEvents.map((e) => (e.data as { phase: string }).phase)).toEqual([
      'start',
      'substep',
      'substep',
      'substep',
      'substep',
      'end',
    ]);

    // 每次 substep 事件携带截至当前的累积快照（2 个唯一节点，running→ok 原地更新）
    const substepEvents = toolEvents
      .map((e) => e.data)
      .filter((d): d is Extract<(typeof toolEvents)[number]['data'], { phase: 'substep' }> => d.phase === 'substep');
    expect(substepEvents.map((d) => d.substeps.length)).toEqual([1, 1, 2, 2]);
    expect(substepEvents.at(-1)!.substeps[1]).toMatchObject({ id: 'llm', status: 'ok' });

    const endData = toolEvents.at(-1)!.data as Extract<
      (typeof toolEvents)[number]['data'],
      { phase: 'end' }
    >;
    expect(endData.status).toBe('ok');
    expect(endData.source).toBe('flow');
    expect(endData.substeps).toHaveLength(2);

    // 落库 trace 同构
    expect(trace).toHaveLength(1);
    expect(trace[0]!.tool).toBe('flow:wf-1');
    expect(trace[0]!.substeps?.map((s) => s.id)).toEqual(['start', 'llm']);
  });

  it('v1.1 大输出双视图：outgoing 入模内容按预算压缩且保首 id，trace 标 compacted，summary 不变', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: `ROW-${String(i + 1).padStart(4, '0')}`,
      status: 'active',
      payload: '数据'.repeat(400),
    }));
    const fullOutput = JSON.stringify(rows);
    const bigTool: Tool = {
      name: 'mcp:db:query',
      description: '大表查询',
      parameters: { type: 'object' },
      permission: 'read',
      async run(): Promise<ToolResult> {
        return { ok: true, output: fullOutput, summary: '查询返回 100 行' };
      },
    };
    const toolMap: ToolMap = new Map([[bigTool.name, bigTool]]);
    const runtime = {
      resolveTool: (name: string) =>
        name === bigTool.name ? { tool: bigTool, source: 'mcp:db' } : null,
    } as unknown as ToolRuntime;
    const calls: ToolCall[] = [
      { id: 'call-big', type: 'function' as const, function: { name: bigTool.name, arguments: '{}' } },
    ];

    const trace: ToolTraceEntry[] = [];
    const outgoing: import('@wbfm/ai').ChatMessage[] = [];
    const events = await drain(
      runToolCallLoop({
        calls,
        toolMap,
        toolCtx: { knowledgeBaseId: null, retrieve: async () => [] },
        deps: {} as ServiceDeps,
        runtime,
        assistantId: 'a1',
        turnTrace: null,
        trace,
        outgoing,
        citations: [],
        toolMessageBudgetTokens: 400,
        onAbort: () => undefined,
      }),
    );

    // ① 入模内容被压缩：400 token 预算（较未压缩 ≥25k token 下降远超 60%）
    const modelContent = outgoing.find((m) => m.role === 'tool')?.content as string;
    expect(modelContent).not.toBe(fullOutput);
    expect(modelContent).toContain('ROW-0001'); // ② 首个 id 保留，模型可据此二次调用
    expect(events.filter((e) => e.event === 'tool').at(-1)).toBeTruthy();

    // trace 标 compacted 并记 token 账；③ UI 卡片看 resultSummary 原文不变
    expect(trace).toHaveLength(1);
    expect(trace[0]!.compacted).toBe(true);
    expect(trace[0]!.originalTokens).toBeGreaterThan(25_000);
    expect(trace[0]!.modelTokens).toBeLessThanOrEqual(400);
    expect(trace[0]!.resultSummary).toBe('查询返回 100 行');

    const endData = events.filter((e) => e.event === 'tool').at(-1)!.data as {
      resultSummary: string;
    };
    expect(endData.resultSummary).toBe('查询返回 100 行');
  });
});
