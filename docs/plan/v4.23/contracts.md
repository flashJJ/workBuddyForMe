# v4.23 契约冻结（M0）

> 状态：已冻结（2026-11-23）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md) · [选题](./README.md)
> 原则：默认行为不变；零迁移；不新增事件类型；风险节点不自动重放

## 1. checkpoint 契约

```ts
// packages/core/src/flow/queue/checkpoint.ts

export interface CheckpointNode {
  nodeId: string;
  status: 'succeeded' | 'skipped';
  /** 节点产出；skipped 为 undefined */
  outputs?: Record<string, unknown>;
}

export interface FlowCheckpoint {
  runId: string;
  /** 已落定节点（按 compiled.order 排序，仅 succeeded/skipped） */
  nodes: CheckpointNode[];
  /** 最近一个成功节点，仅用于观测与展示 */
  lastSucceededNodeId: string | null;
}

/** 从运行记录重建 checkpoint；不存在可复用节点时返回 null */
export function loadCheckpoint(
  runs: WorkflowRunRepository,
  runId: string,
): FlowCheckpoint | null;
```

- 只读 `workflow_runs.input_json` 与 `node_executions`；
- `running` 不进入 checkpoint；
- 同一 nodeId 出现多行时取最后一行（重试/续跑可能复用同一行）。

## 2. 恢复决策契约

```ts
// packages/core/src/flow/queue/resume-policy.ts

export type ResumeReason =
  | 'waiting_human'
  | 'safe_in_flight'
  | 'empty_checkpoint';

export type ResumeRejectReason =
  | 'unsafe_in_flight'
  | 'version_missing'
  | 'chat_request_gone'
  | 'already_active';

export type ResumeDecision =
  | { eligible: true; reason: ResumeReason; unsafeNodeId?: string }
  | { eligible: false; reason: ResumeRejectReason; nodeId?: string };

decideResume(params: {
  run: WorkflowRunView;
  nodes: NodeExecutionView[];
  compiled: CompiledFlow | null;
  activeRunIds: ReadonlySet<string>;
}): ResumeDecision;
```

判定顺序：

1. 本进程已持有执行者 → `already_active`；
2. `trigger === 'chat'` → `chat_request_gone`；
3. 编译产物缺失 → `version_missing`；
4. 存在 `running` 的 human / agent / 写危险 tool → `unsafe_in_flight`；
5. 运行原状态为 `waiting_human` → `waiting_human`；
6. 存在 `running` 的安全节点 → `safe_in_flight`；
7. 无任何已开始节点 → `empty_checkpoint`。

**安全节点类型**：`llm`、`knowledgeSearch`、`condition`、只读 `tool`、`end`、`start`。

## 3. 引擎续跑契约

```ts
// packages/core/src/flow/graph/types.ts
export interface RunFlowOptions {
  // ...既有字段
  /** v4.23：续跑检查点；缺省表示全新运行 */
  checkpoint?: FlowCheckpoint;
  /** v4.23：续跑原因（写入 run_started） */
  resumeReason?: string;
}
```

- 引擎初始化时预置 `state` 与 `scope`；
- `succeeded` 节点写入 `scope[nodeId] = { outputs }`，start 额外写 `params = options.input`；
- `skipped` 节点只写 `state`；
- 已落定节点在串行与并行路径都**静默跳过**，不补发任何事件；
- condition 的 `liveEdges` 由 checkpoint 中该节点的 `result` 重建；
- 续跑运行不重复写 `node_executions`：`run-store` 创建时预加载 nodeId → executionId 映射。

## 4. 重试与超时策略

```ts
// packages/shared/src/schemas/flow/policy.ts
export const flowNodePolicySchema = z.object({
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).default(1),
      backoffMs: z.number().int().min(100).max(60_000).default(1_000),
      maxBackoffMs: z.number().int().min(100).max(120_000).default(30_000),
    })
    .optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
});
```

- 策略从节点 `config` 读取，非法值在保存时拒绝；
- 未配置 `retry` → `maxAttempts=1`；
- 未配置 `timeoutMs` → 不超时；
- 退避：`min(backoffMs * 2^(attempt-1), maxBackoffMs)`，无抖动；
- 重试判定只看执行体是否抛错；引用解析、参数校验、权限拒绝不重试；
- 超时仅对 `llm`、`knowledgeSearch`、只读 `tool`、`end` 生效；human / 写危险 tool / agent 忽略。

## 5. 事件契约

| 事件 | 新增可选字段 |
|---|---|
| `run_started` | `resumed?: boolean`、`resumeReason?: string` |
| `node_started` | `attempt?: number`（1 起；首次可省略） |
| `node_failed` | `attempt?: number`（最终失败的尝试序号） |

- 不新增事件类型；
- 已落定节点续跑时不补发事件；
- `durationMs` 为单次尝试耗时，不是累计耗时。

## 6. 幂等与副作用

| 状态 | 续跑 |
|---|---|
| `succeeded` | 复用输出，不执行 |
| `skipped` | 维持跳过 |
| `running` 安全节点 | 允许重执行（至少一次） |
| `running` 风险节点 | 不自动续跑 |

- 执行幂等键：`${runId}:${nodeId}`；
- 跨重启不依赖内存 memo，依赖 checkpoint 的 `succeeded` 状态；
- 写/危险 tool 不自动重放是硬约束。

## 7. 迁移与依赖

- **零迁移**：不新增表、不新增列、不改备份格式、不改 `LATEST_SCHEMA_VERSION`；
- 续跑状态迁移复用 `queued`：`interrupted → queued`；
- 不新增运行时依赖；
- 若实现中发现必须迁移，必须提供回滚脚本、备份校验与升级说明，并在本文件补充记录。

## 8. 验收不变量

1. 已成功节点在续跑中不执行，副作用只发生一次；
2. `waiting_human` 运行重启后续跑并重新进入等待；
3. 风险在途运行保持 `interrupted`，原因可查；
4. `maxAttempts=3` 且持续失败时恰好执行 3 次；
5. 超时节点按失败收敛且消息可读；
6. 未配置策略、无中断时事件序列与 v4.22 完全一致；
7. `pnpm check`、`pnpm verify:local` 与定向测试全绿。
