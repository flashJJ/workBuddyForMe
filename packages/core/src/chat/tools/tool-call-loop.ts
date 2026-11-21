import { traceAsync, type ToolCall } from '@wbfm/ai';
import type { Citation, ToolSubstep } from '@wbfm/shared/types';
import type { ToolContext } from '../../tools/types';
import { executeCall } from '../../tools/tool-executor';
import { createToolTurnBudget, type ToolTurnBudget } from '../../tools/budget/turn-budget';
import { createSubstepQueue } from '../turns/substep-queue';
import type { OrchestratorEvent } from '../base/types';
import type { ToolCallLoopOutcome, ToolCallLoopParams } from './tool-call-loop-types';
import { takeParallelRun } from './loop/parallel-batch';
import {
  finalizeToolCall,
  prepareToolCall,
  type ReadyToolCall,
  type ToolStepContext,
} from './loop/tool-call-step';
import { maybeStartLocalSearch } from './loop/local-search-start';

export type { ToolCallLoopOutcome, ToolCallLoopParams } from './tool-call-loop-types';

/**
 * 单轮预算挂在 toolCtx 上：toolCtx 每轮对话创建一次，跨多个工具轮次共享，
 * 轮次结束随对象一起回收（WeakMap 不阻止 GC）。
 */
const turnBudgets = new WeakMap<ToolContext, ToolTurnBudget>();

type StepOutcome = { aborted: boolean; citations: Citation[] };

/** 单次调用：门控 → 执行（含 flow 子步骤流）→ 收尾 */
async function* runSingleCall(
  ctx: ToolStepContext,
  call: ToolCall,
  citations: Citation[],
): AsyncGenerator<OrchestratorEvent, StepOutcome> {
  const prepared = yield* prepareToolCall(ctx, call);
  if (prepared.kind !== 'ready') return { aborted: prepared.kind === 'abort', citations };
  if (prepared.immediate) {
    return yield* finalizeToolCall({ ...ctx, prepared, result: prepared.immediate, substeps: [], citations });
  }

  // v0.8：flow 工具执行中逐节点推进子步骤，经队列转成 tool/substep SSE 事件。
  // 入队的是回调时刻的快照（run 内可能同步连发多条，避免 yield 时数组已被整体推进）。
  const substeps: ToolSubstep[] = [];
  const queue = createSubstepQueue<ToolSubstep[]>();
  const callToolCtx: ToolContext = {
    ...ctx.toolCtx,
    onSubstep: (substep) => {
      const index = substeps.findIndex((item) => item.id === substep.id);
      if (index >= 0) substeps[index] = substep;
      else substeps.push(substep);
      queue.push([...substeps]);
    },
  };
  const execution = traceAsync(
    {
      name: `tool:${prepared.call.function.name}`,
      runType: 'tool',
      parent: ctx.turnTrace,
      inputs: { callId: prepared.call.id, arguments: prepared.args, argsSummary: prepared.argsSummary },
      metadata: { tool: prepared.call.function.name, source: prepared.source, permission: prepared.permission },
    },
    () => executeCall(prepared.tool!, prepared.call, callToolCtx),
    (value) => ({ ok: value.ok, summary: value.summary, durationMs: Date.now() - prepared.startedAt }),
  ).finally(() => queue.close());

  for (;;) {
    const item = await queue.next();
    if (item.done) break;
    yield { event: 'tool', data: { phase: 'substep', callId: prepared.call.id, substeps: item.value } };
  }
  const result = await execution;
  const finalResult = yield* maybeStartLocalSearch({
    ctx,
    prepared,
    result,
    alreadyStarted: () => ctx.localSearchStarted,
    markStarted: () => {
      ctx.localSearchStarted = true;
    },
  });
  return yield* finalizeToolCall({ ...ctx, prepared, result: finalResult, substeps, citations });
}

/** 同轮联网批量：逐个门控后并发执行，再按原顺序收尾回灌（模型看到的顺序不变） */
async function* runParallelBatch(
  ctx: ToolStepContext,
  run: ToolCall[],
  citations: Citation[],
): AsyncGenerator<OrchestratorEvent, StepOutcome> {
  const ready: ReadyToolCall[] = [];
  for (const call of run) {
    const prepared = yield* prepareToolCall(ctx, call);
    if (prepared.kind === 'abort') return { aborted: true, citations };
    if (prepared.kind === 'ready') ready.push(prepared);
  }
  const results = await Promise.all(
    ready.map((prepared) =>
      prepared.immediate
        ? Promise.resolve(prepared.immediate)
        : executeCall(prepared.tool!, prepared.call, ctx.toolCtx),
    ),
  );
  for (let index = 0; index < ready.length; index += 1) {
    const finalResult = yield* maybeStartLocalSearch({
      ctx,
      prepared: ready[index]!,
      result: results[index]!,
      alreadyStarted: () => ctx.localSearchStarted,
      markStarted: () => {
        ctx.localSearchStarted = true;
      },
    });
    const outcome = yield* finalizeToolCall({
      ...ctx,
      prepared: ready[index]!,
      result: finalResult,
      substeps: [],
      citations,
    });
    citations = outcome.citations;
    if (outcome.aborted) return { aborted: true, citations };
  }
  return { aborted: false, citations };
}

/**
 * 单轮工具调用循环：权限门控（HITL）→ 执行 → 追踪/事件 → 回灌出站消息。
 * 同一轮内连续的联网只读调用并发执行（最多 3 个），其余仍按顺序执行。
 * 中断时在首个 await 后同步收尾（onAbort），已产出片段不丢。
 */
export async function* runToolCallLoop(
  params: ToolCallLoopParams,
): AsyncGenerator<OrchestratorEvent, ToolCallLoopOutcome> {
  const budget = turnBudgets.get(params.toolCtx) ?? createToolTurnBudget(
    params.contextWindow,
    params.researchDepth,
  );
  turnBudgets.set(params.toolCtx, budget);

  const ctx: ToolStepContext = {
    toolCtx: params.toolCtx,
    toolMap: params.toolMap,
    deps: params.deps,
    runtime: params.runtime,
    assistantId: params.assistantId,
    turnTrace: params.turnTrace,
    trace: params.trace,
    outgoing: params.outgoing,
    toolMessageBudgetTokens: params.toolMessageBudgetTokens,
    fetchFailures: params.fetchFailures ?? new Map<string, number>(),
    degradedFetchUrls: [],
    budget,
    localSearchStarted: false,
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.taskScope ? { taskScope: params.taskScope } : {}),
    ...(params.approvalContext ? { approvalContext: params.approvalContext } : {}),
  };

  let citations = params.citations;
  let index = 0;
  while (index < params.calls.length) {
    const run = takeParallelRun(params.calls, index);
    const outcome =
      run.length > 0
        ? yield* runParallelBatch(ctx, run, citations)
        : yield* runSingleCall(ctx, params.calls[index]!, citations);
    citations = outcome.citations;
    if (outcome.aborted) {
      params.onAbort();
      return { aborted: true, citations, degradedFetchUrls: ctx.degradedFetchUrls };
    }
    index += run.length > 0 ? run.length : 1;
  }

  return { aborted: false, citations, degradedFetchUrls: ctx.degradedFetchUrls };
}
