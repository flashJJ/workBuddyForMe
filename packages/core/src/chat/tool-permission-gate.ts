import type { ChatMessage } from '@wbfm/ai';
import type { PermissionLevel, ToolTraceEntry } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import type { Tool } from '../tools/types';
import type { OrchestratorEvent } from './types';

export interface ToolGateParams {
  deps: ServiceDeps;
  tool: Tool | undefined;
  toolName: string;
  callId: string;
  argsSummary: string;
  assistantId: string;
  signal?: AbortSignal;
}

export interface ToolGateResult {
  denied: boolean;
  /** denied=true 时已生成的拒绝 trace 条目（调用方负责 push） */
  traceEntry?: ToolTraceEntry;
  /** denied=true 时回灌给模型的「用户拒绝」tool 消息（调用方负责 push 到出站消息） */
  toolMessage?: ChatMessage;
}

/**
 * v0.6 M2 权限门控：write/danger 工具未授权时触发 HITL 挂起-恢复。
 * 关键时序：先调 confirmations.request() 注册挂起项，再 yield
 * tool_confirmation_required 事件（Promise executor 同步注册），否则消费者
 * 收到事件立即 resolve 会落空。
 * 无 confirmations（如 desktop 未装配）时直接拒绝，向后兼容。
 */
export async function* gateToolPermission(
  params: ToolGateParams,
): AsyncGenerator<OrchestratorEvent, ToolGateResult> {
  const { deps, tool, toolName, callId, argsSummary, assistantId, signal } = params;
  const permission: PermissionLevel = tool?.permission ?? 'read';
  const granted =
    !tool ||
    !deps.permissions ||
    deps.permissions.isAllowed(toolName, permission, `assistant:${assistantId}`);
  if (granted) return { denied: false };

  const decisionPromise = deps.confirmations ? deps.confirmations.request(callId, signal) : null;
  yield {
    event: 'tool_confirmation_required',
    data: { callId, tool: toolName, permission, argsSummary },
  };
  const decision = decisionPromise ? await decisionPromise : 'deny';
  if (decision === 'allow') return { denied: false };

  // 拒绝：向模型回传结构化「用户拒绝」结果，助手能得体继续而非报错
  const output = `工具 ${toolName} 未获得用户授权（权限级别：${permission}），用户已拒绝本次调用。请向用户说明情况。`;
  const summary = `用户拒绝授权（${permission}）`;
  const traceEntry: ToolTraceEntry = {
    callId,
    tool: toolName,
    argsSummary,
    status: 'error',
    durationMs: 0,
    resultSummary: summary,
    error: summary,
    startedAt: new Date().toISOString(),
  };
  yield {
    event: 'tool',
    data: {
      phase: 'end',
      callId,
      tool: toolName,
      status: 'error',
      durationMs: 0,
      resultSummary: summary,
      error: summary,
    },
  };
  return {
    denied: true,
    traceEntry,
    toolMessage: { role: 'tool', content: output, toolCallId: callId, name: toolName },
  };
}
