# v4.26 契约：会排班

> 冻结项：多定时数据模型、时区口径、创建/更新输入、仓储与 API、Secret 轮换、错误与上限。
> 变更需在 spec 中登记并同步本文件。

## 1. 类型（`packages/shared/src/types/flow.ts`）

```ts
export interface FlowScheduleView {
  id: string;
  workflowId: string;
  /** 用户可读名称；空串时 UI 显示 cron */
  name: string;
  cron: string;
  /** IANA 时区，如 Asia/Shanghai */
  timezone: string;
  enabled: boolean;
  /** 调度触发时传给 start 节点的入参（不含 scheduledAt / scheduleId） */
  input: Record<string, unknown> | null;
  /** 下次执行时间（UTC ISO） */
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastStatus: FlowScheduleLastStatus | null;
  createdAt: string;
  updatedAt: string;
}
```

`FlowScheduleLastStatus` 不变：`created | skipped_busy | error | disabled`。

## 2. Schema（`packages/shared/src/schemas/flow/schedule.ts`）

```ts
export const FLOW_SCHEDULE_LIMIT = 5;
export const DEFAULT_FLOW_SCHEDULE_TIMEZONE = 'Asia/Shanghai';

export const flowScheduleCreateSchema = z
  .object({
    name: z.string().trim().max(40).optional(),
    cron: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(64).default(DEFAULT_FLOW_SCHEDULE_TIMEZONE),
    enabled: z.boolean().default(true),
    input: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    // cron: validateCron；timezone: isValidTimeZone
  });

export const flowScheduleUpdateSchema = z
  .object({
    name: z.string().trim().max(40).optional(),
    cron: z.string().trim().min(1).max(120).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    input: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个字段');

export const flowScheduleRunSchema = z.object({
  scheduleId: z.string().min(1).optional(),
});

export type FlowScheduleCreateInput = z.infer<typeof flowScheduleCreateSchema>;
export type FlowScheduleUpdateInput = z.infer<typeof flowScheduleUpdateSchema>;
export type FlowScheduleRunInput = z.infer<typeof flowScheduleRunSchema>;
```

## 3. 时区（`packages/shared/src/schemas/flow/timezone/schedule-zone.ts`）

```ts
export const DEFAULT_FLOW_SCHEDULE_TIMEZONE = 'Asia/Shanghai';

/** 合法 IANA 时区（Intl 可识别） */
export function isValidTimeZone(timeZone: string): boolean;

/** 严格晚于 from、按 timeZone 解释 cron 的下一次时间；5 年无解抛 CronError */
export function nextCronTimeInZone(spec: CronSpec, from: Date, timeZone: string): Date;
```

口径：

- 非法的时区或 cron 分别抛 `CronError` / 由 schema 拒绝；
- 春季 DST 跳跃中不存在的墙钟时刻跳过；
- 秋季重复的墙钟时刻只执行一次。

## 4. 数据库（v056）

```sql
CREATE TABLE workflow_schedules_new (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  enabled INTEGER NOT NULL DEFAULT 1,
  input_json TEXT,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_run_id TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO workflow_schedules_new
  (id, workflow_id, name, cron, timezone, enabled, input_json, next_run_at,
   last_run_at, last_run_id, last_status, created_at, updated_at)
SELECT id, workflow_id, '', cron, 'Asia/Shanghai', enabled, input_json, next_run_at,
       last_run_at, last_run_id, last_status, created_at, updated_at
FROM workflow_schedules;

DROP TABLE workflow_schedules;
ALTER TABLE workflow_schedules_new RENAME TO workflow_schedules;

CREATE INDEX idx_workflow_schedules_due ON workflow_schedules(enabled, next_run_at);
CREATE INDEX idx_workflow_schedules_workflow ON workflow_schedules(workflow_id);
```

- `LATEST_SCHEMA_VERSION = 56`；
- 旧 id、cron、input、状态字段全部保留；
- 所有 `migrations/*.test.ts` 的版本断言同步到 56；v054 测试改为只迁移到 54。

## 5. 仓储

```ts
interface ScheduleCreateFields {
  workflowId: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  input?: Record<string, unknown> | null;
  nextRunAt: string;
}

interface ScheduleUpdateFields {
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  /** null 表示清空 */
  input?: Record<string, unknown> | null;
  nextRunAt?: string;
}

interface WorkflowScheduleRepository {
  listByWorkflow(workflowId: string): FlowScheduleView[];
  getById(id: string): FlowScheduleView | null;
  countByWorkflow(workflowId: string): number;
  create(fields: ScheduleCreateFields): FlowScheduleView;
  update(id: string, fields: ScheduleUpdateFields): FlowScheduleView | null;
  remove(id: string): boolean;

  listDue(nowIso: string, limit?: number): FlowScheduleView[];
  claimDue(id: string, expectedNextRunAt: string, nextRunAt: string): boolean;
  recordOutcome(id: string, outcome: ScheduleOutcome): void;
}
```

触发器仓储新增：

```ts
rotateSecret(id: string, secretHash: string): FlowTriggerView | null;
```

## 6. 服务

```ts
interface FlowScheduleService {
  list(workflowId: string): FlowScheduleView[];
  create(workflowId: string, input: FlowScheduleCreateInput): FlowScheduleView;
  update(workflowId: string, scheduleId: string, patch: FlowScheduleUpdateInput): FlowScheduleView;
  remove(workflowId: string, scheduleId: string): boolean;
  runNow(workflowId: string, scheduleId?: string): RunNowResult;
}

interface FlowTriggerService {
  // v4.25 方法不变
  rotateSecret(workflowId: string, triggerId: string):
    { trigger: FlowTriggerView; secret: string };
}
```

`RunNowResult` 不变：`{ runId: string | null; reason?: 'busy' | 'not_published' }`。

调度器补充约定：cron / 时区永久无效时记录 `error` 并自动停用该条定时，避免每 tick 重复失败。

## 7. HTTP 面

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/api/flows/:id/schedules` | — | `{ schedules: FlowScheduleView[] }` |
| POST | `/api/flows/:id/schedules` | `flowScheduleCreateSchema` | `{ schedule }` |
| PATCH | `/api/flows/:id/schedules/:scheduleId` | `flowScheduleUpdateSchema` | `{ schedule }` |
| DELETE | `/api/flows/:id/schedules/:scheduleId` | — | `{ removed: boolean }` |
| POST | `/api/flows/:id/schedules/run` | `flowScheduleRunSchema`（可空 body） | `{ runId, reason? }` |
| POST | `/api/flows/:id/triggers/:triggerId/rotate` | — | `{ trigger, secret }` |

错误：

| HTTP | 场景 |
|---|---|
| 404 | 流程 / 定时 / 触发器不存在（或不属于该流程） |
| 409 | 定时条数达到 5；未发布流程创建/启用 |
| 422 | cron 非法、时区非法、非 Webhook 触发器轮换、空更新 |
| 500 | 未预期错误（不泄露内部细节） |

## 8. 上限与常量

| 常量 | 值 | 位置 |
|---|---|---|
| 每流程定时上限 | 5 | shared `FLOW_SCHEDULE_LIMIT` |
| 定时名称长度 | 40 | shared schema |
| cron 长度 | 120 | shared schema |
| 时区长度 | 64 | shared schema |
| 调度 tick | 30s | core scheduler |
| 启动补偿 | 只补一次 | core scheduler |
| 默认时区 | `Asia/Shanghai` | shared / 迁移默认 |

## 9. Secret 轮换语义

- 仅 `kind='webhook'`；
- 生成 `wft_` + 32 bytes base64url；
- 库内只存 SHA-256 hex，旧哈希被覆盖；
- 旧 Secret 在下一次请求即 401，无并行有效期；
- 新 Secret 只在轮换响应出现一次，不写日志、不写运行入参；
- 触发器 id 与 `webhookPath` 不变。
