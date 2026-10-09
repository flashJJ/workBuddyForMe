import type { ChatMessage, ToolCall } from '@wbfm/ai';
import type {
  PermissionLevel,
  ToolEventPayload,
  ToolSubstep,
  ToolTraceEntry,
} from '@wbfm/shared/types';
import type { ToolResult } from '../tools/types';
import type { CompactOutcome } from '../tools/tool-result-compact';

/** tool end 事件负载（phase 判别为 'end' 的一支） */
export type ToolEndPayload = Extract<ToolEventPayload, { phase: 'end' }>;

/** 子步骤快照：有则挂 substeps 拷贝，无则空对象（逐字平移自循环内联逻辑） */
export function snapshotSubsteps(substeps: ToolSubstep[]): { substeps?: ToolSubstep[] } {
  return substeps.length > 0 ? { substeps: [...substeps] } : {};
}

export interface ToolTraceBuildInput {
  call: ToolCall;
  name: string;
  argsSummary: string;
  result: ToolResult;
  durationMs: number;
  startedAt: number;
  source: string;
  permission: PermissionLevel;
  substepSnapshot: { substeps?: ToolSubstep[] };
  /** v1.1：入模压缩结果；仅 ok 时非 null，compacted=true 才落 token 账 */
  compaction: CompactOutcome | null;
}

/** 执行终态 trace 条目（result/output 对象本身不被改写，UI 卡片看 summary） */
export function buildToolTraceEntry(input: ToolTraceBuildInput): ToolTraceEntry {
  const {
    call,
    name,
    argsSummary,
    result,
    durationMs,
    startedAt,
    source,
    permission,
    substepSnapshot,
    compaction,
  } = input;
  return {
    callId: call.id,
    tool: name,
    argsSummary,
    status: result.ok ? 'ok' : 'error',
    durationMs,
    resultSummary: result.summary,
    ...(result.ok ? {} : { error: result.summary }),
    startedAt: new Date(startedAt).toISOString(),
    source,
    permission,
    ...substepSnapshot,
    ...(compaction?.compacted
      ? {
          compacted: true,
          originalTokens: compaction.originalTokens,
          modelTokens: compaction.tokens,
        }
      : {}),
  };
}

export interface ToolEndBuildInput {
  call: ToolCall;
  name: string;
  result: ToolResult;
  durationMs: number;
  source: string;
  permission: PermissionLevel;
  substepSnapshot: { substeps?: ToolSubstep[] };
}

/** 执行终态 tool/end SSE 事件负载 */
export function buildToolEndData(input: ToolEndBuildInput): ToolEndPayload {
  const { call, name, result, durationMs, source, permission, substepSnapshot } = input;
  return {
    phase: 'end',
    callId: call.id,
    tool: name,
    status: result.ok ? 'ok' : 'error',
    durationMs,
    resultSummary: result.summary,
    ...(result.ok ? {} : { error: result.summary }),
    source,
    permission,
    ...substepSnapshot,
  };
}

export interface BreakerTripOutput {
  traceEntry: ToolTraceEntry;
  data: ToolEndPayload;
  message: ChatMessage;
}

/** 熔断命中时的 trace/事件/回灌消息三件套（cooldown 到期前短期跳过执行） */
export function buildBreakerTripOutput(input: {
  call: ToolCall;
  name: string;
  argsSummary: string;
  source: string;
  permission: PermissionLevel;
}): BreakerTripOutput {
  const { call, name, argsSummary, source, permission } = input;
  const trippedSummary = '已熔断';
  const trippedOutput = `工具 ${name} 已熔断：连续失败达到阈值，5 分钟内自动半开恢复，或前往「设置 → 工具熔断器」手动重置。`;
  const trippedStartedAt = Date.now();
  const traceEntry: ToolTraceEntry = {
    callId: call.id,
    tool: name,
    argsSummary,
    status: 'error',
    durationMs: 0,
    resultSummary: trippedSummary,
    error: trippedSummary,
    startedAt: new Date(trippedStartedAt).toISOString(),
    source,
    permission,
  };
  const data: ToolEndPayload = {
    phase: 'end',
    callId: call.id,
    tool: name,
    status: 'error',
    durationMs: 0,
    resultSummary: trippedSummary,
    error: trippedSummary,
    source,
    permission,
  };
  const message: ChatMessage = {
    role: 'tool',
    content: trippedOutput,
    toolCallId: call.id,
    name: call.function.name,
  };
  return { traceEntry, data, message };
}
