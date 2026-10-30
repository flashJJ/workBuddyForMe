import type { ToolTraceEntry } from '@wbfm/shared/types';
import type { OrchestratorEvent } from './types';
import type { ToolGateParams, ToolGateResult } from './tool-gate-types';

/** v2.13 M3：拒绝结果与 tool end 事件集中构造（门控主体保持可读） */

export function deniedResult(params: ToolGateParams, message: string): ToolGateResult {
  const traceEntry: ToolTraceEntry = {
    callId: params.callId,
    tool: params.toolName,
    argsSummary: params.argsSummary,
    status: 'error',
    durationMs: 0,
    resultSummary: message,
    error: message,
    startedAt: new Date().toISOString(),
    source: params.source,
    permission: params.permission,
  };
  return {
    denied: true,
    traceEntry,
    toolMessage: {
      role: 'tool',
      content: message,
      toolCallId: params.callId,
      name: params.toolName,
    },
  };
}

/** 拒绝并同步广播 tool end（避免每个拒绝分支重复事件体） */
export async function* deniedWithEvent(
  params: ToolGateParams,
  message: string,
): AsyncGenerator<OrchestratorEvent, ToolGateResult> {
  const result = deniedResult(params, message);
  yield {
    event: 'tool',
    data: {
      phase: 'end',
      callId: params.callId,
      tool: params.toolName,
      status: 'error',
      durationMs: 0,
      resultSummary: result.traceEntry!.resultSummary,
      error: result.traceEntry!.error,
      source: params.source,
      permission: params.permission,
    },
  };
  return result;
}
