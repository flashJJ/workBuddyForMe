import { traceAsync, type ToolCall } from '@wbfm/ai';
import type { Citation, ToolSubstep, ToolTraceEntry } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { createAttachmentService } from '../services/attachment-service';
import type { ToolMap, ToolContext, ToolResult } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TraceHandle } from '@wbfm/ai';
import { executeCall, summarizeArgs } from '../tools/tool-executor';
import { gateToolPermission } from './tool-permission-gate';
import { mergeCitations, safeParseArgs, unknownToolResult } from './orchestrator-helpers';
import { createSubstepQueue } from './substep-queue';
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
  /** v0.7 M2：任务作用域（对话 id / 任务运行 id），用于 remember='task' 批量授权 */
  taskScope?: string;
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
      taskScope: params.taskScope,
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
    const substeps: ToolSubstep[] = [];
    let result: ToolResult;
    if (tool) {
      // v0.8：flow 工具执行中逐节点推进子步骤，经队列转成 tool/substep SSE 事件。
      // 入队的是回调时刻的快照（run 内可能同步连发多条，避免 yield 时数组已被整体推进）。
      const queue = createSubstepQueue<ToolSubstep[]>();
      const callToolCtx: ToolContext = {
        ...toolCtx,
        onSubstep: (substep) => {
          const idx = substeps.findIndex((s) => s.id === substep.id);
          if (idx >= 0) substeps[idx] = substep;
          else substeps.push(substep);
          queue.push([...substeps]);
        },
      };
      const execution = traceAsync(
        {
          name: `tool:${name}`,
          runType: 'tool',
          parent: turnTrace,
          inputs: { callId: call.id, arguments: safeParseArgs(call), argsSummary },
          metadata: { tool: name, source, permission },
        },
        () => executeCall(tool, call, callToolCtx),
        (value) => ({ ok: value.ok, summary: value.summary, durationMs: Date.now() - startedAt }),
      ).finally(() => queue.close());

      for (;;) {
        const item = await queue.next();
        if (item.done) break;
        yield { event: 'tool', data: { phase: 'substep', callId: call.id, substeps: item.value } };
      }
      result = await execution;
    } else {
      result = unknownToolResult(call.function.name);
    }
    const durationMs = Date.now() - startedAt;
    const substepSnapshot = substeps.length > 0 ? { substeps: [...substeps] } : {};

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
      ...substepSnapshot,
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
        ...substepSnapshot,
      },
    };

    citations = mergeCitations(citations, result.citations);
    if (result.citations?.length) {
      yield { event: 'citations', data: { citations } };
    }
    // v0.7 M1：图片结果（如屏幕截图）落盘为附件，并合成 user 消息注入视觉上下文
    // （outgoing 仅为 wire 消息列表，不落库，合成消息无污染）
    if (result.ok && result.images?.length) {
      const attachments = createAttachmentService(deps);
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
      outgoing.push({
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
