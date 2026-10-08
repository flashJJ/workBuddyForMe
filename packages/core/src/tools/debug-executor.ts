import { TOOL_TIMEOUT_MS } from '@wbfm/shared/constants';
import { executeToolCall } from './tool-executor';
import type { ToolResult } from './types';
import type { ToolRuntime } from './tool-runtime';

/** MCP 工具调试执行超时：60s（远程调用慢于本地内置工具） */
export const DEBUG_MCP_TIMEOUT_MS = 60_000;

export interface DebugExecuteParams {
  runtime: ToolRuntime;
  name: string;
  args: unknown;
  signal?: AbortSignal;
}

/**
 * v0.6 M4 调试台执行器：用户在设置页主动选工具填参试跑，不经模型/熔断/HITL。
 *
 * 与对话内执行路径的差异：
 * - 不查询工具熔断状态（用户主动操作即授权）；
 * - 不走权限门控（调试台只读，write/danger 工具仍按其逻辑执行）；
 * - 不落 trace 与 SSE 事件，结果直接返回给面板渲染。
 *
 * MCP 工具超时 60s（远程调用慢），内置工具沿用 TOOL_TIMEOUT_MS（15s）。
 */
export async function debugExecuteTool(params: DebugExecuteParams): Promise<ToolResult> {
  const { runtime, name, args, signal } = params;
  const resolved = runtime.resolveTool(name);
  if (!resolved) {
    return {
      ok: false,
      output: `工具 ${name} 不存在或未启用。请在助手或 MCP 服务器配置中启用后再试。`,
      summary: '工具未启用',
    };
  }
  const ctx = runtime.createDebugToolContext(signal);
  const timeoutMs = resolved.source === 'builtin' ? TOOL_TIMEOUT_MS : DEBUG_MCP_TIMEOUT_MS;
  return executeToolCall(resolved.tool, args, ctx, timeoutMs);
}
