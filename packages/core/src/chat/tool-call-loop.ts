import { traceAsync } from '@wbfm/ai';
import type { ToolSubstep } from '@wbfm/shared/types';
import { createAttachmentService } from '../services/attachment-service';
import type { ToolContext, ToolResult } from '../tools/types';
import { executeCall, summarizeArgs } from '../tools/tool-executor';
import { compactToolOutput, normalizeToolSource } from '../tools/tool-result-compact';
import { gateToolPermission } from './tool-permission-gate';
import { mergeCitations, safeParseArgs, unknownToolResult } from './orchestrator-helpers';
import { createSubstepQueue } from './substep-queue';
import type { OrchestratorEvent } from './types';
import type { ToolCallLoopOutcome, ToolCallLoopParams } from './tool-call-loop-types';
import {
  buildBreakerTripOutput,
  buildToolEndData,
  buildToolTraceEntry,
  snapshotSubsteps,
} from './tool-call-loop-events';

export type { ToolCallLoopOutcome, ToolCallLoopParams } from './tool-call-loop-types';

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
      const tripped = buildBreakerTripOutput({ call, name, argsSummary, source, permission });
      trace.push(tripped.traceEntry);
      yield { event: 'tool', data: tripped.data };
      outgoing.push(tripped.message);
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
    const substepSnapshot = snapshotSubsteps(substeps);

    // v0.6 M4 熔断：记录本次执行结果，连续失败达阈值则下次自动跳过
    breaker?.recordResult(name, result.ok);

    // v1.1 双视图：完整 result.output 不进模型——入模前经中央压缩层产出预算视图；
    // trace 只标 compacted 与 token 账（result/output 对象本身不被改写，UI 卡片看 summary）
    const compaction = result.ok
      ? compactToolOutput(result.output, {
          maxTokens: params.toolMessageBudgetTokens,
          source: normalizeToolSource(source),
          toolName: name,
        })
      : null;

    trace.push(
      buildToolTraceEntry({
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
      }),
    );
    yield {
      event: 'tool',
      data: buildToolEndData({
        call,
        name,
        result,
        durationMs,
        source,
        permission,
        substepSnapshot,
      }),
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
      content: compaction ? compaction.text : result.output,
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
