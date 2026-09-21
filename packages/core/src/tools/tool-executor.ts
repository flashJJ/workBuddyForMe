import { TOOL_TIMEOUT_MS, type ToolName } from '@wbfm/shared';
import type { Tool, ToolContext, ToolResult } from './types';
import { ToolArgError } from './types';

const SUMMARY_MAX_LENGTH = 120;

/** 界面摘要统一裁剪，避免超长结果撑爆工具卡片 */
export function clipSummary(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > SUMMARY_MAX_LENGTH ? `${compact.slice(0, SUMMARY_MAX_LENGTH)}…` : compact;
}

/**
 * 执行一次工具调用：
 * - 参数错误/执行异常均归一为 ok:false 文本（回灌模型，允许其自我纠正）；
 * - 单工具超时（默认 15s）与用户中断信号联动；
 * - 未知工具名由编排器处理，不进本函数。
 */
export async function executeToolCall(
  tool: Tool,
  rawArgs: unknown,
  ctx: ToolContext,
  timeoutMs: number = TOOL_TIMEOUT_MS,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, timeoutSignal])
      : timeoutSignal;
    const result = await tool.run(rawArgs, { ...ctx, signal });
    return {
      ok: result.ok,
      output: result.output,
      summary: clipSummary(result.summary || result.output),
      ...(result.citations ? { citations: result.citations } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (error instanceof ToolArgError) {
      return {
        ok: false,
        output: `工具 ${tool.name} 参数错误：${error.message}。请检查参数后重试，或直接回答用户。`,
        summary: `参数错误：${error.message}`,
      };
    }
    const aborted = ctx.signal?.aborted;
    const timedOut = durationMs >= timeoutMs;
    const reason = aborted ? '用户已中断' : timedOut ? `执行超过 ${timeoutMs / 1000}s 超时` : '执行失败';
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      output: `工具 ${tool.name} ${reason}：${detail}`,
      summary: `${reason}`,
    };
  }
}

/** 解析上游工具调用的 JSON 参数；非法 JSON 抛 ToolArgError */
export function parseToolArgs(call: { function: { arguments: string } }): unknown {
  const raw = call.function.arguments?.trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ToolArgError('参数不是合法 JSON');
  }
}

/** 便捷入口：直接接收上游 ToolCall，参数解析失败也归一为 ok:false 结果 */
export async function executeCall(
  tool: Tool,
  call: { function: { arguments: string } },
  ctx: ToolContext,
  timeoutMs: number = TOOL_TIMEOUT_MS,
): Promise<ToolResult> {
  let args: unknown = {};
  try {
    args = parseToolArgs(call);
  } catch (error) {
    const message = error instanceof ToolArgError ? error.message : '参数解析失败';
    return {
      ok: false,
      output: `工具 ${tool.name} 参数错误：${message}。请检查参数后重试，或直接回答用户。`,
      summary: '参数错误',
    };
  }
  return executeToolCall(tool, args, ctx, timeoutMs);
}

/** 界面用参数摘要：取关键字段拼接，长度受控 */
export function summarizeArgs(toolName: ToolName, args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  if (toolName === 'current_time') return '当前时间';
  if (toolName === 'knowledge_search') return clipSummary(String(record.query ?? ''));
  if (toolName === 'fetch_webpage') return clipSummary(String(record.url ?? ''));
  return clipSummary(JSON.stringify(record));
}
