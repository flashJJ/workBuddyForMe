# v5.0 契约：会兜底

> 冻结项：运行快照、错误分类、补偿队列、批量重放、保留清理、触发器健康、Agent 门控、Webhook HMAC。
> 变更需在 spec 中登记并同步本文件。

## 1. 类型（`packages/shared/src/types/flow.ts`）

```ts
export const FLOW_RUN_FAILURE_CATEGORIES = [
  'config', 'auth', 'network', 'timeout', 'rate_limit', 'tool', 'data', 'version', 'unknown',
] as const;
export type FlowRunFailureCategory = (typeof FLOW_RUN_FAILURE_CATEGORIES)[number];

export interface FlowRunError {
  code: string;
  message: string;
  nodeId?: string;
  category?: FlowRunFailureCategory; // v5.0
  retryable?: boolean;               // v5.0
  hint?: string;                     // v5.0 面向用户的一步建议
}

export interface WorkflowRunView {
  // ...既有字段不变；error 改为 FlowRunError | null
  graphHash: string | null;        // v5.0
  replayBatchId: string | null;    // v5.0
}

export type FlowRunVersionReason =
  | 'same' | 'version_changed' | 'graph_unavailable' | 'node_removed';

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
  'pending', 'retrying', 'recovered', 'exhausted', 'cancelled',
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
  mode?: FlowReplayMode;         // snapshot
  nodeMode?: FlowReplayNodeMode; // failed_node
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
    running: boolean; startedAt: string | null; lastTickAt: string | null;
    tickCount: number; stalled: boolean; lastError: string | null;
  };
  fileWatcher: {
    active: boolean; watchingCount: number;
    lastEventAt: string | null; lastError: string | null;
  };
  compensation: { pending: number; exhausted: number; lastSweepAt: string | null };
  endpoints: Array<{
    endpointId: string; workflowId: string; workflowName: string;
    httpEnabled: boolean; mcpEnabled: boolean; status: string;
    lastUsedAt: string | null; policyRevalidationRequired: boolean;
  }>;
  schedules: Array<{
    scheduleId: string; workflowId: string; workflowName: string; name: string;
    cron: string; timezone: string; enabled: boolean; nextRunAt: string;
    lastRunAt: string | null; lastStatus: string | null;
    missedCount: number; lastMissedAt: string | null;
  }>;
  triggers: Array<{
    triggerId: string; workflowId: string; workflowName: string;
    kind: 'webhook' | 'file'; name: string; enabled: boolean;
    lastFiredAt: string | null; lastRunId: string | null; lastStatus: string | null;
  }>;
  retention: { lastCleanupAt: string | null; removedTotal: number };
}

// FlowScheduleView 增加 missedCount: number; lastMissedAt: string | null
// FlowTriggerView 增加 authMode: FlowWebhookAuthMode | null; hasSigningSecret: boolean
export type FlowWebhookAuthMode = 'bearer' | 'hmac' | 'both';
export interface FlowWebhookAuthConfig { authMode: FlowWebhookAuthMode }
```

## 2. Schema（`packages/shared/src/schemas/flow/run-reliability.ts`）

```ts
export const FLOW_BATCH_REPLAY_LIMIT = 20;
export const FLOW_COMPENSATION_MAX_ATTEMPTS = 3;
export const FLOW_COMPENSATION_BACKOFF_MS = [30_000, 120_000, 600_000] as const;
export const FLOW_RUN_RETENTION_DEFAULTS = {
  enabled: true, successDays: 30, failureDays: 90, maxPerWorkflow: 500,
} as const;

export const flowRunBatchReplaySchema = z.object({
  runIds: z.array(z.string().trim().min(1)).min(1).max(FLOW_BATCH_REPLAY_LIMIT),
  mode: z.enum(['snapshot', 'latest']).optional(),
  nodeMode: z.enum(['whole', 'failed_node']).optional(),
});
export const flowRunReplaySchema = z.object({
  nodeId: z.string().trim().min(1).optional(),
  mode: z.enum(['snapshot', 'latest']).optional(),
});
export const flowRunCleanupSchema = z.object({ dryRun: z.boolean().optional() });
export const flowRunRetentionSchema = z.object({
  enabled: z.boolean(),
  successDays: z.number().int().min(1).max(365),
  failureDays: z.number().int().min(1).max(365),
  maxPerWorkflow: z.number().int().min(50).max(5000),
});
export const flowWebhookAuthSchema = z.object({
  authMode: z.enum(['bearer', 'hmac', 'both']),
});
```

`flowTriggerCreate/UpdateSchema` 的 webhook 分支增加可选 `auth`；缺省 `authMode='bearer'`。

## 3. 数据库（迁移 v057）

`packages/database/src/migrations/v057-run-reliability.ts`；`LATEST_SCHEMA_VERSION = 57`；纯加法，每列先 `PRAGMA table_info` 判断。

```sql
ALTER TABLE workflow_runs ADD COLUMN graph_snapshot_json TEXT;
ALTER TABLE workflow_runs ADD COLUMN graph_hash TEXT;
ALTER TABLE workflow_runs ADD COLUMN replay_batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_replay_batch ON workflow_runs(replay_batch_id);

CREATE TABLE IF NOT EXISTS flow_run_compensations (
  id TEXT PRIMARY KEY,
  root_run_id TEXT NOT NULL UNIQUE REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'pending',
  next_retry_at TEXT,
  last_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  last_error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flow_run_compensations_due
  ON flow_run_compensations(state, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_flow_run_compensations_workflow
  ON flow_run_compensations(workflow_id, created_at DESC);

ALTER TABLE workflow_schedules ADD COLUMN missed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_schedules ADD COLUMN last_missed_at TEXT;
ALTER TABLE workflow_triggers ADD COLUMN secret_cipher TEXT;
```

旧行新列均为 NULL/默认值；旧触发器启用 HMAC 前必须轮换。全仓迁移断言 56→57，`v056` 测试改为只迁移到 56。备份 schema 不含这些表，无需升级。

## 4. 仓储

```ts
// workflow-run-repo.ts
createRun(fields: CreateRunFields & {
  graphSnapshotJson?: string | null;
  graphHash?: string | null;
  replayBatchId?: string | null;
}): WorkflowRunView;
getGraphSnapshot(runId: string): { graphJson: string; hash: string | null } | null;
setReplayBatch(runId: string, batchId: string): void;
listTerminalBefore(cutoffIso: string, limit?: number): WorkflowRunView[];
listTerminalBeyondPerWorkflow(workflowId: string, keep: number): WorkflowRunView[];
deleteRuns(runIds: string[]): number; // 级联 node_executions

// flow-run-compensation-repo.ts
getByRootRun(rootRunId: string): FlowRunCompensationView | null;
getByLastRun(lastRunId: string): FlowRunCompensationView | null;
listDue(nowIso: string, limit?: number): FlowRunCompensationView[];
listByWorkflow(workflowId: string): FlowRunCompensationView[];
listActive(): FlowRunCompensationView[]; // pending/retrying，清理保护用
countsByState(): { pending: number; exhausted: number };
create(fields: { rootRunId; workflowId; attempt; nextRetryAt; lastErrorJson }): FlowRunCompensationView;
claim(id: string, expectedNextRetryAt: string): boolean; // state=pending 且时间匹配
markRetrying(id: string, lastRunId: string): void;
markPending(id: string, attempt: number, nextRetryAt: string, lastErrorJson: string): void;
markRecovered(id: string): void;
markExhausted(id: string, lastErrorJson: string): void;
markCancelled(id: string): void;

// workflow-schedule-repo.ts
recordMissed(id: string, missedCount: number, atIso: string): void;

// workflow-trigger-repo.ts
setSecret(id: string, fields: { secretHash: string; secretCipher: string }): FlowTriggerView | null;
getSecretCipher(id: string): string | null;
```

## 5. 服务

```ts
// failure-classifier.ts
export function classifyFlowRunError(
  error: FlowRunError,
  failedNode?: { nodeId: string; nodeType: string },
): FlowRunError;

// run-snapshot.ts
export function serializeRunGraph(graph: FlowGraph): { json: string; hash: string };
export function parseRunGraphSnapshot(raw: string | null | undefined): FlowGraph | null;
export function loadRunGraph(params: {
  run: WorkflowRunView;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
}): { graph: FlowGraph; version: number; source: 'snapshot' | 'version' };
export function diffRunGraph(params: {
  snapshot: FlowGraph;
  current: FlowGraph | null;
  runVersion: number;
  currentVersion: number | null;
  failedNodeId?: string | null;
}): FlowRunVersionCheck;

// compensation-service.ts（依赖 run-replay-service，不直接 createRun）
export interface FlowCompensationService {
  onRunTerminal(run: WorkflowRunView): void;
  sweep(now?: Date): { claimed: number; started: number; deferred: number; cancelled: number };
  list(workflowId: string): FlowRunCompensationView[];
  lastSweepAt(): string | null;
}

// run-replay-service.ts：单条/批量/补偿共用
export interface FlowRunReplayService {
  replayOne(input: {
    runId: string;
    mode?: FlowReplayMode;
    nodeMode?: FlowReplayNodeMode;
    nodeId?: string; // 显式起点，优先于 nodeMode
    batchId?: string;
  }): { runId: string; parentRunId: string };
  replayBatch(input: FlowRunBatchReplayInput): FlowRunBatchReplayResult;
}

// retention-service.ts（策略存 settings 表 flows.runRetention.*）
export type FlowRunRetentionPolicy = z.infer<typeof flowRunRetentionSchema>;
export interface FlowRetentionService {
  getPolicy(): FlowRunRetentionPolicy;
  setPolicy(policy: FlowRunRetentionPolicy): void;
  cleanup(options?: { dryRun?: boolean; now?: Date }): {
    removed: number; scanned: number; dryRun: boolean;
    byWorkflow: Record<string, number>;
  };
}

// runtime-health-service.ts
export interface FlowRuntimeHealthService { snapshot(): FlowRuntimeHealthView }

// trigger-auth.ts
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string;
export function verifyWebhookSignature(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
  windowSec?: number; // 300
}): boolean;
```

分类规则：显式 code 映射 > 消息关键词 > 节点类型兜底 > `unknown`；仅 `network/timeout/rate_limit` 的 `retryable=true`。

`loadRunGraph` 顺序：合法快照 → `run.version` 精确版本 → 抛 `flow/run-graph-unavailable`（不静默回退当前生产图）。

`replayOne` 先用 `loadRunGraph` 固定图与版本，再走 `run-service.createRunFromGraph({ graph, version, graphHash, parentRunId, ... })`；该内部入口显式接收图，避免重放再次读生产版本。普通运行仍走 `createRun`（内部同样调用 `createRunFromGraph`）。

Agent 门控：`engine-agent` 仅对无人值守触发注入 `toolGate(toolName, permission)`；内部调用 `evaluateUnattendedPolicy`，拒绝时写审计 `flow.agent.tool_denied` 并返回结构化工具错误；`manual/chat` 不注入。

`authenticateWebhook` 增加 `rawBody/timestamp/signature`；Bearer 逻辑不变；HMAC 签名输入 `${timestamp}.${rawBody}`，小写 hex，常量时间比较，时间窗 300s。

## 6. HTTP

| 方法 | 路径 | 请求/说明 |
|---|---|---|
| POST | `/api/flow-runs/replay-batch` | `flowRunBatchReplaySchema` → `FlowRunBatchReplayResult` |
| GET | `/api/flow-runs/health` | → `FlowRuntimeHealthView` |
| POST | `/api/flow-runs/cleanup` | `flowRunCleanupSchema` → `{removed,scanned,dryRun,byWorkflow}` |
| POST | `/api/flows/runs/:runId/replay` | `flowRunReplaySchema` → `{runId,parentRunId}` |
| GET | `/api/flows/runs/:runId` | 运行详情 + `versionCheck` |
| PATCH | `/api/flows/:id/triggers/:triggerId` | 增加 `auth` |
| POST | `/api/flows/:id/triggers/:triggerId/rotate` | 同时更新 hash/cipher |
| POST | `/api/public/flows/triggers/:triggerId` | bearer / hmac / both |

公开 Webhook：HMAC 模式必须读原始 body 再 `JSON.parse`；缺头/过期/错误签名 401；解析失败 400；幂等、busy、未发布行为不变。

错误映射：404 不存在；409 图不可用/节点在新版本被删/HMAC 密文缺失/补偿前置不满足；422 参数与上限；401 仅公开 Webhook 验签。

| code | 场景 |
|---|---|
| `flow/run-graph-unavailable` | 快照与精确版本都不可用 |
| `flow/replay-node-missing` | `latest` 下失败节点不存在 |
| `flow/batch-limit-exceeded` | 批量 >20 |
| `flow/compensation-exhausted` | 补偿达到 3 次 |
| `flow/hmac-secret-unavailable` | 启用 HMAC 但无密文 |
| `flow/hmac-invalid` | 签名/时间戳失败（对外 401） |

## 7. 上限与常量

| 常量 | 值 | 位置 |
|---|---|---|
| 批量重放上限 | 20 | shared `FLOW_BATCH_REPLAY_LIMIT` |
| 补偿最大次数 | 3 | shared `FLOW_COMPENSATION_MAX_ATTEMPTS` |
| 补偿退避 | 30s / 2m / 10m | shared `FLOW_COMPENSATION_BACKOFF_MS` |
| 补偿 sweep | 60s | core compensation-service |
| 健康心跳阈值 | 3×30s | core runtime-health-service |
| 定时错过计数上限 | 100 | core scheduler |
| HMAC 时间窗 | 300s | core trigger-auth |
| 清理批量 | 200 | core retention-service |
| 保留默认 | 30/90 天、500 条 | shared defaults |
| 迁移版本 | 57 | database runner |

## 8. 关键语义

- **快照**：仅 `createRun` 写一次；`graph_hash` 为 canonical JSON（键升序、数组保序）的 SHA-256；列表不读快照。
- **补偿**：一行对应一条失败链；仅无人值守 `failed` + `retryable` 创建；补偿重放 `parentRunId=last_run_id`，不新建行；`attempt` 只在创建重放时 +1；busy 顺延不加；流程停用/删除 → `cancelled`。
- **批量**：不写补偿行；批次 id 只追溯，不保证幂等；部分失败返回 200，逐条 `ok:false`；全部参数错误才 4xx。
- **清理**：排除非终态与 `pending/retrying` 补偿引用的运行；先按时间再按每流程上限；`dryRun` 不删不审计；分批 ≤200。
- **健康**：只读；`stalled` 仅展示；Webhook 只显示最近接收，不做节奏推断；文件监听状态重启后重置。
- **HMAC**：`bearer` 用 `Authorization`；`hmac` 只认签名头；`both` 两者必需；密钥来自 `secret_cipher` 解密；轮换同事务更新 hash+cipher，旧钥立即失效；新 Secret 只返回一次。
- **Agent 门控**：仅无人值守；拒绝不抛异常，返回工具错误；每次拒绝写审计，避免只丢在节点错误里。

## 9. 审计事件

| action | 触发 | 载荷 |
|---|---|---|
| `flow_compensation_scheduled` | 创建补偿行 | rootRunId、workflowId、attempt、nextRetryAt |
| `flow_compensation_exhausted` | 补偿耗尽 | rootRunId、workflowId、attempt、lastRunId |
| `flow_retention_cleanup` | 实际清理 | removed、scanned、byWorkflow、cutoffs |
| `flow_agent_tool_denied` | Agent 工具被无人值守策略拒绝 | runId、nodeId、agentRunId、toolName、permission、reason |

沿用 `audit_events` 结构，`actor='system'`。

## 10. i18n key

`flowRuns.batch.*`、`flowRuns.health.*`、`flowRuns.version.*`、`flowRuns.compensation.*`、`flowRuns.error.category.*`、`flowRuns.error.hint.*`、`settings.runRetention.*`、`flowEditor.trigger.authMode.*`；zh/en 同步，parity 测试通过。
