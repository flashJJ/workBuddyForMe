import { traceAsync, type ToolCall } from '@wbfm/ai';
import type { Citation, ToolTraceEntry } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import type { ToolMap, ToolContext } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TraceHandle } from '@wbfm/ai';
import { executeCall, summarizeArgs } from '../tools/tool-executor';
import { gateToolPermission } from './tool-permission-gate';
import { mergeCitations, safeParseArgs, unknownToolResult } from './orchestrator-helpers';
import type { OrchestratorEvent } from './types';
import type { ChatMessage } from '@wbfm/ai';

export interface ToolCallLoopParams {
  calls: ToolCall[];
  toolMap: ToolMap;
  toolCtx: ToolContext;
  deps: ServiceDeps;
  /** v0.6 M4：工具运行时（用于 resolveTool 获取 source） */
  runtime: ToolRuntime;
  assistantId: string;
  turnTrace: TraceHandle | null;
  /** 工具调用追踪（本函数会 push 条目） */
  trace: ToolTraceEntry[];
  /** 出站消息（本函数会 push tool 结果消息） */
  outgoing: ChatMessage[];
  citations: Citation[];
  signal?: AbortSignal;
  /** 中断收尾：stopMessage + saveMessageToolTrace（由编排器注入） */
  onAbort: () => void;
}

export interface ToolCallLoopOutcome {
  /** true=处理中断，调用方应 yield done 并 return */
  aborted: boolean;
  citations: Citation[];
}

/**
 * 单轮工具调用循环：权限门控（HITL）→ 执行 → 追踪/事件 → 回灌出站消息。
 * 中断时在首个 await 后同步收尾（onAbort），已产出片段不丢。
 */
export async function* runToolCallLoop(
  params: ToolCallLoopParams,
): AsyncGenerator<OrchestratorEvent, ToolCallLoopOutcome> {
  const {
    calls,
    toolMap,
    toolCtx,
    deps,
    runtime,
    assistantId,
    turnTrace,
    trace,
    outgoing,
    signal,
    onAbort,
  } = params;
  let citations = params.citations;

  for (const call of calls) {
    const name = call.function.name;
    const argsSummary = summarizeArgs(name, safeParseArgs(call));
    const tool = toolMap.get(name);
    // v0.6 M4：解析来源与权限（toolMap 可能不含该工具——未知工具名走 unknownToolResult）
    const resolved = runtime.resolveTool(name);
    const source = resolved?.source ?? 'unknown';
    const permission = resolved?.tool.permission ?? 'read';

    // v0.6 M2 权限门控：write/danger 未授权时 HITL 挂起-恢复或拒绝
    const gate = yield* gateToolPermission({
      deps,
      tool,
      toolName: name,
      callId: call.id,
      argsSummary,
      assistantId,
      signal,
      source,
      permission,
    });
    if (gate.denied) {
      trace.push(gate.traceEntry!);
      outgoing.push(gate.toolMessage!);
      if (signal?.aborted) {
        onAbort();
        return { aborted: true, citations };
      }
      continue; // 跳过本次工具调用，继续下一个 call
    }
    // 放行（含 read 工具与已授权 write/danger）：落到下方正常执行路径

    // v0.6 M4 熔断检查：连续失败的工具短期跳过执行，cooldown 到期自动半开重试
    const breaker = deps.breakers;
    if (breaker?.isTripped(name)) {
      const trippedSummary = '已熔断';
      const trippedOutput = `工具 ${name} 已熔断：连续失败达到阈值，5 分钟内自动半开恢复，或前往「设置 → 工具熔断器」手动重置。`;
      const trippedStartedAt = Date.now();
      trace.push({
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
      });
      yield {
        event: 'tool',
        data: {
          phase: 'end',
          callId: call.id,
          tool: name,
          status: 'error',
          durationMs: 0,
          resultSummary: trippedSummary,
          error: trippedSummary,
          source,
          permission,
        },
      };
      outgoing.push({
        role: 'tool',
        content: trippedOutput,
        toolCallId: call.id,
        name: call.function.name,
      });
      continue;
    }

    yield {
      event: 'tool',
      data: { phase: 'start', callId: call.id, tool: name, argsSummary, source, permission },
    };

    const startedAt = Date.now();
    const result = tool
      ? await traceAsync(
          {
            name: `tool:${name}`,
            runType: 'tool',
            parent: turnTrace,
            inputs: { callId: call.id, arguments: safeParseArgs(call), argsSummary },
            metadata: { tool: name, source, permission },
          },
          () => executeCall(tool, call, toolCtx),
          (value) => ({ ok: value.ok, summary: value.summary, durationMs: Date.now() - startedAt }),
        )
      : unknownToolResult(call.function.name);
    const durationMs = Date.now() - startedAt;

    // v0.6 M4 熔断：记录本次执行结果，连续失败达阈值则下次自动跳过
    breaker?.recordResult(name, result.ok);

    trace.push({
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
    });
    yield {
      event: 'tool',
      data: {
        phase: 'end',
        callId: call.id,
        tool: name,
        status: result.ok ? 'ok' : 'error',
        durationMs,
        resultSummary: result.summary,
        ...(result.ok ? {} : { error: result.summary }),
        source,
        permission,
      },
    };

    citations = mergeCitations(citations, result.citations);
    if (result.citations?.length) {
      yield { event: 'citations', data: { citations } };
    }
    outgoing.push({
      role: 'tool',
      content: result.output,
      toolCallId: call.id,
      name: call.function.name,
    });

    if (signal?.aborted) {
      onAbort();
      return { aborted: true, citations };
    }
  }

  return { aborted: false, citations };
}
