# v4.24 规格：会守时

> 状态：已冻结（2026-11-23）
> 上游：[README.md](./README.md) · [contracts.md](./contracts.md) · [tasks.md](./tasks.md)
> 一句话：让流程按 cron 自动开始；调度落库、重启不丢、错过补一次、在途则跳过。

## 1. 目标与非目标

| 编号 | 目标 | 验收 |
|---|---|---|
| G1 | cron 可解析、可预测 | 5 字段表达式解析与下次时间计算有单测 |
| G2 | 调度持久化 | 重启后配置与下次时间仍在 |
| G3 | 到期自动触发 | tick 创建 `trigger=schedule` 运行 |
| G4 | 错过补偿一次 | 关机跨过多个周期，重启后只补跑一次 |
| G5 | 单飞保护 | 同流程有在途运行时跳过并记录 |
| G6 | 默认不变 | 未配置定时的流程行为与 v4.23 一致 |
| G7 | 纯加法迁移 | 新表 + 新仓储，不改现有表结构 |

### 非目标

- webhook / 文件监听 / 事件触发；
- 一个流程多个定时；
- 每定时独立时区；
- 错过多周期的逐次补齐；
- 多实例分布式互斥。

## 2. 方案

### 2.1 cron 语义

5 字段：`分 时 日 月 周`，系统本地时区。

| 字段 | 范围 | 说明 |
|---|---|---|
| 分 | 0–59 | |
| 时 | 0–23 | |
| 日 | 1–31 | |
| 月 | 1–12 | |
| 周 | 0–7 | 0 与 7 都是周日 |

支持 `*`、单值、`a-b`、`*/n`、`a-b/n`、逗号列表。
日与周都被限制时，按标准 cron 语义「任一匹配」；其中一个为 `*` 时只按另一个匹配。

`nextCronTime(spec, from)` 返回严格晚于 `from` 的最近时间；搜索上限 5 年，找不到抛错。

### 2.2 表结构（v054）

```sql
CREATE TABLE workflow_schedules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE REFERENCES workflows(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  input_json TEXT,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_run_id TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workflow_schedules_due ON workflow_schedules(enabled, next_run_at);
```

- 一个流程一行；`UNIQUE(workflow_id)`；
- `last_status ∈ {created, skipped_busy, error, disabled}`；
- 迁移纯加法，不动现有表。

### 2.3 调度 tick

```text
每 30 秒：
  查出 enabled=1 且 next_run_at <= now 的调度
  对每条：
    用「旧 next_run_at」做条件更新，推进到从 now 计算的下次时间
    更新成功者才继续（原子认领）
    校验流程已发布
    若同流程有 queued/running/waiting_human 运行 → 记录 skipped_busy
    否则创建 trigger=schedule 的运行 → 记录 created
```

- tick 启动时立即执行一次（覆盖重启后的到期项）；
- 认领成功即推进下次时间，避免同一次触发被重复处理；
- 创建失败（未发布、版本缺失）记录 `error`，不重试。

### 2.4 运行入参与门控

- 运行入参 = 调度配置的 `input` + `{ scheduledAt, scheduleId }`；
- 触发方式固定为 `schedule`；
- 非交互：写/危险工具沿用现有无人值守门控，默认拒绝；
- 使用生产版本，与 API/MCP 触发一致。

### 2.5 单飞与错过补偿

- 同流程存在 `queued / running / waiting_human` 运行时跳过本次，不排队；
- 错过多个周期只补一次：下次时间总是从「当前时刻」重新计算，不从旧时间递减。

### 2.6 服务与 API

```ts
FlowScheduleService {
  get(workflowId): FlowScheduleView | null;
  upsert(workflowId, input: { cron, enabled, input? }): FlowScheduleView;
  remove(workflowId): boolean;
  runNow(workflowId): { runId: string | null; reason?: 'busy' | 'not_published' };
}
```

路由：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/flows/:id/schedule` | 读取配置与下次/上次状态 |
| PUT | `/api/flows/:id/schedule` | 保存（解析 cron 并计算下次时间） |
| DELETE | `/api/flows/:id/schedule` | 删除 |
| POST | `/api/flows/:id/schedule/run` | 立即运行一次（不改变下次时间） |

### 2.7 UI

- 工具栏新增「定时」入口（仅已发布流程可开启）；
- 对话框：cron 输入、启用开关、下次/上次运行、立即运行、删除；
- 保存时展示解析错误；保存成功后回显下次时间。

## 3. 验收清单

### 自动

- cron：`*`、列表、范围、步长、dom/dow OR、非法表达式、5 年无解；
- 仓储：创建/更新/删除/到期查询/原子认领；
- 调度器：到期创建运行、重启补偿一次、单飞跳过、禁用不触发、未发布记录 error；
- 回归：未配置定时的流程事件序列与 v4.23 一致。

### 手测

| 场景 | 断言 |
|---|---|
| 配置 `*/1 * * * *` | 一分钟后自动出现 schedule 运行 |
| 关闭应用跨过一个周期再打开 | 只补跑一次，下次时间正确 |
| 运行中再次到期 | 本次跳过，`last_status=skipped_busy` |
| 删除/禁用定时 | 不再自动触发 |
| 未发布流程 | 保存被拒绝或触发记录 error |
