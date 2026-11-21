import type { ChatMessage, ToolCall, TraceHandle } from '@wbfm/ai';
import type { Citation, PermissionLevel, ToolSubstep, ToolTraceEntry } from '@wbfm/shared/types';
import { createAttachmentService } from '../../../services/assistant/attachment-service';
import type { ServiceDeps } from '../../../services/base/deps';
import type { Tool, ToolContext, ToolMap, ToolResult } from '../../../tools/types';
import { compactToolOutput, normalizeToolSource } from '../../../tools/tool-result-compact';
import type { ToolRuntime } from '../../../tools/tool-runtime';
import type { ToolTurnBudget } from '../../../tools/budget/turn-budget';
import {
  recordToolBudgetUsage,
  reserveToolBudget,
  toolBudgetExceeded,
} from '../../../tools/budget/turn-budget';
import { enforceToolResultBudget } from './tool-result-budget';
import {
  FETCH_DEGRADE_THRESHOLD,
  degradedFetchResult,
  fetchUrlOf,
  shouldCountBreakerFailure,
  shouldDegradeFetch,
} from '../fetch-degrade';
import {
  gateToolPermission,
  type ApprovalContext,
  type ToolGateResult,
} from '../tool-permission-gate';
import { mergeCitations, safeParseArgs, unknownToolResult } from '../../orchestrator/orchestrator-helpers';
import type { OrchestratorEvent } from '../../base/types';
import {
  buildBreakerTripOutput,
  buildToolEndData,
  buildToolTraceEntry,
  snapshotSubsteps,
} from '../tool-call-loop-events';
import { summarizeArgs } from '../../../tools/tool-executor';
import { confirmationDetailsOf } from './confirmation-details';

/** 单次工具调用的共享上下文（调用循环与并行批处理共用） */
export interface ToolStepContext {
  toolCtx: ToolContext;
  toolMap: ToolMap;
  deps: ServiceDeps;
  runtime: ToolRuntime;
  assistantId: string;
  taskScope?: string;
  approvalContext?: ApprovalContext;
  turnTrace: TraceHandle | null;
  trace: ToolTraceEntry[];
  outgoing: ChatMessage[];
  signal?: AbortSignal;
  toolMessageBudgetTokens: number;
  fetchFailures: Map<string, number>;
  degradedFetchUrls: string[];
  budget: ToolTurnBudget;
  /** v4.16：本轮是否已提示并启动过本地搜索（多个并发搜索只弹一次） */
  localSearchStarted: boolean;
}

/** 已通过门控、可以执行的调用（immediate 存在时无需真正执行） */
export interface ReadyToolCall {
  kind: 'ready';
  call: ToolCall;
  args: unknown;
  tool: Tool | null;
  source: string;
  permission: PermissionLevel;
  argsSummary: string;
  startedAt: number;
  immediate?: ToolResult;
  /** 预算拒绝的结果不计入用量 */
  countBudget: boolean;
  fetchUrl: string | null;
  skippedByDegrade: boolean;
}

export type PreparedToolCall =
  | ReadyToolCall
  | { kind: 'skip' }
  | { kind: 'abort' };

/**
 * 门控与派发决策：权限（HITL）→ 预算 → 熔断 → 判定是否需要真实执行。
 * 产出 tool/start 事件；调用方负责执行与收尾。
 */
export async function* prepareToolCall(
  ctx: ToolStepContext,
  call: ToolCall,
): AsyncGenerator<OrchestratorEvent, PreparedToolCall> {
  const name = call.function.name;
  const args = safeParseArgs(call);
  const argsSummary = summarizeArgs(name, args);
  const details = confirmationDetailsOf(ctx.toolCtx, name, args);
  // v2.27：同一链接连续失败达上限后，本轮后续调用直接跳过，不再发网络请求
  const fetchUrl = name === 'fetch_webpage' ? fetchUrlOf(args) : null;
  const skippedByDegrade =
    fetchUrl !== null && (ctx.fetchFailures.get(fetchUrl) ?? 0) >= FETCH_DEGRADE_THRESHOLD;
  const tool = ctx.toolMap.get(name);
  const resolved = ctx.runtime.resolveTool(name);
  const source = resolved?.source ?? 'unknown';
  const permission = resolved?.tool.permission ?? 'read';

  // v4.11 单轮联网预算：超限直接拒绝，避免边搜边抓把上下文与耗时撑爆
  const budgetDenial = toolBudgetExceeded(ctx.budget, name);

  let gate: ToolGateResult;
  if (budgetDenial) gate = { denied: false };
  else
    gate = yield* gateToolPermission({
      deps: ctx.deps,
      tool,
      toolName: name,
      callId: call.id,
      argsSummary,
      args,
      assistantId: ctx.assistantId,
      taskScope: ctx.taskScope,
      signal: ctx.signal,
      source,
      permission,
      ...(details ? { details } : {}),
      ...(ctx.approvalContext ? { approvalContext: ctx.approvalContext } : {}),
    });
  if (gate.denied) {
    ctx.trace.push(gate.traceEntry!);
    ctx.outgoing.push(gate.toolMessage!);
    return ctx.signal?.aborted ? { kind: 'abort' } : { kind: 'skip' };
  }

  // v0.6 M4 熔断检查：连续失败的工具短期跳过执行，cooldown 到期自动半开重试
  if (ctx.deps.breakers?.isTripped(name)) {
    const tripped = buildBreakerTripOutput({ call, name, argsSummary, source, permission });
    ctx.trace.push(tripped.traceEntry);
    yield { event: 'tool', data: tripped.data };
    ctx.outgoing.push(tripped.message);
    return { kind: 'skip' };
  }

  yield {
    event: 'tool',
    data: { phase: 'start', callId: call.id, tool: name, argsSummary, source, permission },
  };

  let immediate: ToolResult | undefined;
  if (budgetDenial) immediate = budgetDenial;
  else if (skippedByDegrade && fetchUrl) immediate = degradedFetchResult(fetchUrl);
  else if (!tool) immediate = unknownToolResult(name);

  // 派发前预占次数：并发批次内多个抓取都在结果返回前检查预算，必须提前占位
  if (!budgetDenial) reserveToolBudget(ctx.budget, name);

  return {
    kind: 'ready',
    call,
    args,
    tool: tool ?? null,
    source,
    permission,
    argsSummary,
    startedAt: Date.now(),
    ...(immediate ? { immediate } : {}),
    countBudget: !budgetDenial,
    fetchUrl,
    skippedByDegrade,
  };
}

export interface FinalizeToolCallParams extends ToolStepContext {
  prepared: ReadyToolCall;
  result: ToolResult;
  substeps: ToolSubstep[];
  citations: Citation[];
}

/** 执行收尾：预算/降级/熔断记账 → 入模压缩 → trace 与 end 事件 → 回灌消息 */
export async function* finalizeToolCall(
  params: FinalizeToolCallParams,
): AsyncGenerator<OrchestratorEvent, { aborted: boolean; citations: Citation[] }> {
  const { prepared } = params;
  const name = prepared.call.function.name;
  let result = params.result;
  let citations = params.citations;
  const durationMs = Date.now() - prepared.startedAt;
  const substepSnapshot = snapshotSubsteps(params.substeps);

  if (prepared.countBudget) recordToolBudgetUsage(params.budget, result.output);

  if (prepared.fetchUrl) {
    const url = prepared.fetchUrl;
    if (result.ok) {
      params.fetchFailures.delete(url);
    } else if (!prepared.skippedByDegrade && shouldDegradeFetch(result)) {
      const failures = (params.fetchFailures.get(url) ?? 0) + 1;
      params.fetchFailures.set(url, failures);
      if (failures >= FETCH_DEGRADE_THRESHOLD) result = { ...result, degraded: true };
    }
    if (result.degraded && !params.degradedFetchUrls.includes(url)) {
      params.degradedFetchUrls.push(url);
    }
  }

  // v0.6 M4 熔断：确定性失败不计入，避免误锁整个工具
  params.deps.breakers?.recordResult(name, result.ok, shouldCountBreakerFailure(name, result));

  // v1.1 双视图：完整 result.output 不进模型——入模前经中央压缩层产出预算视图
  const compaction = result.ok
    ? compactToolOutput(result.output, {
        maxTokens: params.toolMessageBudgetTokens,
        source: normalizeToolSource(prepared.source),
        toolName: name,
      })
    : null;

  params.trace.push(
    buildToolTraceEntry({
      call: prepared.call,
      name,
      argsSummary: prepared.argsSummary,
      result,
      durationMs,
      startedAt: prepared.startedAt,
      source: prepared.source,
      permission: prepared.permission,
      substepSnapshot,
      compaction,
    }),
  );
  yield {
    event: 'tool',
    data: buildToolEndData({
      call: prepared.call,
      name,
      result,
      durationMs,
      source: prepared.source,
      permission: prepared.permission,
      substepSnapshot,
    }),
  };

  citations = mergeCitations(citations, result.citations);
  if (result.citations?.length) yield { event: 'citations', data: { citations } };

  // v0.7 M1：图片结果落盘为附件，并合成 user 消息注入视觉上下文
  if (result.ok && result.images?.length) {
    const attachments = createAttachmentService(params.deps);
    for (const image of result.images) {
      try {
        attachments.save({
          filename: `${name}-${Date.now()}.png`,
          mimeType: image.mimeType,
          buffer: Buffer.from(image.dataBase64, 'base64'),
        });
      } catch (error) {
        // 落盘失败不阻断：图片仍可经 wire 注入本轮对话
        console.error(`[tool] 图片附件落盘失败（${name}）:`, error);
      }
    }
    params.outgoing.push({
      role: 'user',
      content: [
        { type: 'text', text: `[工具 ${name} 返回的图片]` },
        ...result.images.map((image) => ({
          type: 'image_url' as const,
          image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` },
        })),
      ],
    });
  }

  params.outgoing.push({
    role: 'tool',
    content: compaction ? compaction.text : result.output,
    toolCallId: prepared.call.id,
    name,
  });
  // v4.11：超预算折叠更早的工具结果，保证最新结果完整、后续抓取不被提前拒绝
  enforceToolResultBudget(params.outgoing, params.budget.limits.toolResultTokens);

  return { aborted: Boolean(params.signal?.aborted), citations };
}
