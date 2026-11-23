/**
 * v5.0 运行兜底类型：错误分类、快照版本检查、补偿、重放、健康与 Webhook 鉴权。
 * 从 types/flow.ts 拆出以控行数；flow.ts 继续 re-export，公开面不变。
 */

export const FLOW_RUN_FAILURE_CATEGORIES = [
  'config',
  'auth',
  'network',
  'timeout',
  'rate_limit',
  'tool',
  'data',
  'version',
  'unknown',
] as const;
export type FlowRunFailureCategory = (typeof FLOW_RUN_FAILURE_CATEGORIES)[number];

export interface FlowRunError {
  code: string;
  message: string;
  nodeId?: string;
  /** v5.0：错误类别（旧数据可缺省） */
  category?: FlowRunFailureCategory;
  /** v5.0：是否允许自动补偿 */
  retryable?: boolean;
  /** v5.0：面向用户的一步建议 */
  hint?: string;
}

export type FlowRunVersionReason =
  | 'same'
  | 'version_changed'
  | 'graph_unavailable'
  | 'node_removed';

export interface FlowRunVersionCheck {
  runVersion: number;
  currentVersion: number | null;
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  canResumeFromFailedNode: boolean;
  reason: FlowRunVersionReason;
}

export const FLOW_COMPENSATION_STATES = [
  'pending',
  'retrying',
  'recovered',
  'exhausted',
  'cancelled',
] as const;
export type FlowCompensationState = (typeof FLOW_COMPENSATION_STATES)[number];

export interface FlowRunCompensationView {
  id: string;
  rootRunId: string;
  workflowId: string;
  attempt: number;
  maxAttempts: number;
  state: FlowCompensationState;
  nextRetryAt: string | null;
  lastRunId: string | null;
  lastError: FlowRunError | null;
  createdAt: string;
  updatedAt: string;
}

export type FlowReplayMode = 'snapshot' | 'latest';
export type FlowReplayNodeMode = 'whole' | 'failed_node';

export interface FlowRunBatchReplayInput {
  runIds: string[];
  mode?: FlowReplayMode;
  nodeMode?: FlowReplayNodeMode;
}

export interface FlowRunBatchReplayItem {
  runId: string;
  ok: boolean;
  newRunId?: string;
  reason?: string;
}

export interface FlowRunBatchReplayResult {
  batchId: string;
  results: FlowRunBatchReplayItem[];
  summary: { requested: number; started: number; skipped: number; failed: number };
}

export interface FlowRuntimeHealthView {
  generatedAt: string;
  scheduler: {
    running: boolean;
    startedAt: string | null;
    lastTickAt: string | null;
    tickCount: number;
    stalled: boolean;
    lastError: string | null;
  };
  fileWatcher: {
    active: boolean;
    watchingCount: number;
    lastEventAt: string | null;
    lastError: string | null;
  };
  compensation: { pending: number; exhausted: number; lastSweepAt: string | null };
  endpoints: Array<{
    endpointId: string;
    workflowId: string;
    workflowName: string;
    httpEnabled: boolean;
    mcpEnabled: boolean;
    status: string;
    lastUsedAt: string | null;
    policyRevalidationRequired: boolean;
  }>;
  schedules: Array<{
    scheduleId: string;
    workflowId: string;
    workflowName: string;
    name: string;
    cron: string;
    timezone: string;
    enabled: boolean;
    nextRunAt: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    missedCount: number;
    lastMissedAt: string | null;
  }>;
  triggers: Array<{
    triggerId: string;
    workflowId: string;
    workflowName: string;
    kind: 'webhook' | 'file';
    name: string;
    enabled: boolean;
    lastFiredAt: string | null;
    lastRunId: string | null;
    lastStatus: string | null;
  }>;
  retention: { lastCleanupAt: string | null; removedTotal: number };
}

export type FlowWebhookAuthMode = 'bearer' | 'hmac' | 'both';

export interface FlowWebhookAuthConfig {
  authMode: FlowWebhookAuthMode;
}
