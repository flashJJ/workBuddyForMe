import type { FlowEventPayload, FlowNodeExecStatus } from '@wbfm/shared/types';

export type FlowRunPhase =
  | 'connecting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface FlowLiveState {
  events: FlowEventPayload[];
  /** nodeId → 节点执行状态（画布高亮/时间线共用） */
  nodeStatus: Record<string, FlowNodeExecStatus>;
  /** 当前挂起中的节点（人工审核或危险工具授权） */
  waitingNodeId: string | null;
  phase: FlowRunPhase;
  connection: 'connecting' | 'open' | 'closed' | 'error';
  output: unknown;
  errorMessage: string | null;
  errorNodeId: string | null;
}
