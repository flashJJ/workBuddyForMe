# v4.24 契约冻结（M0）

> 状态：已冻结（2026-11-23）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md) · [选题](./README.md)
> 原则：默认关闭；每流程最多一个定时；系统本地时区；错过只补一次

## 1. cron 契约

```ts
// packages/shared/src/schemas/flow/schedule.ts

export interface CronSpec {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>; // 0–6，0=周日
  /** 日/周是否都被限制（用于 OR 语义） */
  domRestricted: boolean;
  dowRestricted: boolean;
}

export function parseCron(expression: string): CronSpec; // 非法抛 CronError
export function nextCronTime(spec: CronSpec, from: Date): Date; // 严格晚于 from；5 年无解抛错
export function cronMatches(spec: CronSpec, date: Date): boolean;
```

- 字段顺序：分 时 日 月 周；
- 语法：`*`、`n`、`a-b`、`*/n`、`a-b/n`、逗号列表；
- 周字段 0 与 7 都映射为周日；
- 日与周都被限制时任一匹配即命中；任一为 `*` 时只按另一个匹配；
- 使用系统本地时区（`Date` 本地方法），不引入时区库。

## 2. 调度表契约（v054）

```ts
export interface FlowScheduleRow {
  id: string;
  workflow_id: string;
  cron: string;
  enabled: number;      // 0/1
  input_json: string | null;
  next_run_at: string;  // ISO
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: FlowScheduleLastStatus | null;
  created_at: string;
  updated_at: string;
}

export type FlowScheduleLastStatus = 'created' | 'skipped_busy' | 'error' | 'disabled';
```

约束：

- `workflow_id` 唯一；
- 迁移纯加法，新增表与索引，不改现有表；
- `LATEST_SCHEMA_VERSION` 从 53 → 54；
- 备份/恢复沿用整库机制，无需额外映射。

## 3. 仓储契约

```ts
WorkflowScheduleRepository {
  getByWorkflow(workflowId): FlowScheduleView | null;
  listDue(nowIso: string): FlowScheduleView[];
  upsert(input): FlowScheduleView;
  removeByWorkflow(workflowId): boolean;
  /** 原子认领：仅当 next_run_at 仍等于 expected 且 enabled=1 时推进 */
  claimDue(id: string, expectedNextRunAt: string, nextRunAt: string): boolean;
  recordOutcome(id: string, outcome: {
    lastRunAt: string;
    lastRunId?: string | null;
    lastStatus: FlowScheduleLastStatus;
  }): void;
}
```

## 4. 调度器契约

```ts
createFlowScheduleScheduler({
  schedules,          // 仓储
  workflows,
  runs,
  flowRunner,         // createRun
  now?: () => Date,
  intervalMs?: number, // 缺省 30_000
  catchUpOnStart?: boolean, // 缺省 true，启动立即 tick 一次
}): { start(): void; tick(now?: Date): Promise<TickResult>; dispose(): void }
```

`tick` 单条处理顺序：

1. `claimDue`：以旧 `next_run_at` 为条件推进到 `nextCronTime(spec, now)`；失败则跳过（已被其他 tick 认领）；
2. 流程不存在/未发布/无生产版本 → `recordOutcome(error)`；
3. 同流程存在 `queued | running | waiting_human` 运行 → `recordOutcome(skipped_busy)`；
4. 创建运行：`trigger='schedule'`，入参 `{ ...config.input, scheduledAt, scheduleId }`；
5. `recordOutcome(created, runId)`。

## 5. 运行契约

| 项 | 契约 |
|---|---|
| 触发方式 | `schedule` |
| 版本 | 生产版本（与 api/mcp 一致） |
| 交互 | 非交互；写/危险 tool 默认拒绝 |
| 单飞 | 同流程在途运行时不新建，不排队 |
| 补偿 | 只补一次；下次时间从当前时刻重算 |
| 事件 | 不新增事件类型；`run_started.trigger='schedule'` |

## 6. 服务 API

```ts
FlowScheduleService {
  get(workflowId): FlowScheduleView | null;
  upsert(workflowId, input: FlowScheduleUpsertInput): FlowScheduleView;
  remove(workflowId): boolean;
  runNow(workflowId): { runId: string | null; reason?: 'busy' | 'not_published' };
}
```

保存校验：

- cron 必须可解析；
- `enabled` 缺省 true；
- 流程必须存在；
- 下次时间由服务端计算，客户端不可传入。

## 7. 迁移与依赖

- 迁移 v054：`workflow_schedules` + 到期索引，纯加法；
- 不新增运行时依赖（cron 解析自实现）；
- 回退代码后旧库仍可用；新表残留不影响旧版本。

## 8. 验收不变量

1. 同一调度不会被两个 tick 同时认领；
2. 重启后到期调度只补跑一次；
3. 在途运行存在时，本次触发记录 `skipped_busy` 且不创建运行；
4. 禁用/删除后不再触发；
5. 未配置定时的流程行为与 v4.23 一致；
6. `pnpm check`、`pnpm verify:local` 与定向测试全绿。
