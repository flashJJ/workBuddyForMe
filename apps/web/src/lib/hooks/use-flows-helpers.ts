import type { FlowEventPayload } from '@wbfm/shared/types';
import { API } from '@/lib/api/endpoints';
import type { FlowLiveState } from './use-flows-types';

export const INITIAL_LIVE: FlowLiveState = {
  events: [],
  nodeStatus: {},
  waitingNodeId: null,
  phase: 'connecting',
  connection: 'connecting',
  output: null,
  errorMessage: null,
  errorNodeId: null,
};

/** SSE 事件归一到 live 状态（纯 reducer 片段） */
export function applyFlowEvent(prev: FlowLiveState, e: FlowEventPayload): FlowLiveState {
  const next: FlowLiveState = {
    ...prev,
    events: [...prev.events, e],
    nodeStatus: { ...prev.nodeStatus },
  };
  switch (e.type) {
    case 'run_started':
      next.phase = 'running';
      break;
    case 'node_started':
      next.nodeStatus[e.nodeId] = 'running';
      if (prev.waitingNodeId === e.nodeId) next.waitingNodeId = null;
      break;
    case 'node_succeeded':
      next.nodeStatus[e.nodeId] = 'succeeded';
      if (prev.waitingNodeId === e.nodeId) next.waitingNodeId = null;
      break;
    case 'node_skipped':
      next.nodeStatus[e.nodeId] = 'skipped';
      break;
    case 'node_waiting_human':
      next.nodeStatus[e.nodeId] = 'waiting_human';
      next.waitingNodeId = e.nodeId;
      break;
    case 'node_failed':
      next.nodeStatus[e.nodeId] = 'failed';
      break;
    case 'run_succeeded':
      next.phase = 'succeeded';
      next.connection = 'closed';
      next.output = e.output;
      next.waitingNodeId = null;
      break;
    case 'run_failed':
      next.phase = 'failed';
      next.connection = 'closed';
      next.errorMessage = e.message;
      next.errorNodeId = e.nodeId ?? null;
      next.waitingNodeId = null;
      break;
    case 'run_cancelled':
      next.phase = 'cancelled';
      next.connection = 'closed';
      next.waitingNodeId = null;
      break;
  }
  return next;
}

/** 读取挂载到 window 的托管令牌（EventSource 无法自定义请求头，令牌走 query） */
export function readManagedToken(): string | undefined {
  return (globalThis as { window?: { wbfm?: { token?: string } } }).window?.wbfm?.token;
}

/** 构造运行事件 SSE 地址（有令牌时附加 token 查询参数） */
export function buildFlowRunEventsUrl(runId: string, token: string | undefined): string {
  return `${API.flowRunEvents(runId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/** 同一订阅内去重键：节点事件按 type+nodeId，run 级事件按 type */
export function flowEventDedupeKey(payload: FlowEventPayload): string {
  return 'nodeId' in payload ? `${payload.type}:${payload.nodeId}` : payload.type;
}

/** 终态事件后服务端会关闭流，客户端须主动 close，否则浏览器自动重连→重放→风暴 */
export function isTerminalFlowEvent(payload: FlowEventPayload): boolean {
  return (
    payload.type === 'run_succeeded' ||
    payload.type === 'run_failed' ||
    payload.type === 'run_cancelled'
  );
}

/** onopen：连接打开；首个连接阶段推进到 running，其余阶段保持不变 */
export function onFlowConnectionOpen(prev: FlowLiveState): FlowLiveState {
  return { ...prev, connection: 'open', phase: prev.phase === 'connecting' ? 'running' : prev.phase };
}

/** onerror：运行中/连接中断按 error，进入终态后的关闭视为 closed */
export function onFlowConnectionError(prev: FlowLiveState): FlowLiveState {
  return {
    ...prev,
    connection: prev.phase === 'running' || prev.phase === 'connecting' ? 'error' : 'closed',
  };
}
