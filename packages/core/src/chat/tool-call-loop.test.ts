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
});
