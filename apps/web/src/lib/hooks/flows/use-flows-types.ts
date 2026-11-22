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
  /** v4.22：本次运行实际并行度（只读展示；缺省 1） */
  parallelism: number;
  /** v4.23：本次运行是否从 checkpoint 续跑 */
  resumed: boolean;
  /** v4.23：续跑原因（waiting_human / safe_in_flight / empty_checkpoint） */
  resumeReason: string | null;
  /** v4.23：nodeId → 当前尝试序号（>1 表示重试中） */
  nodeAttempts: Record<string, number>;
}
