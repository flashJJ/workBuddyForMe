# v4.26 版本总结：会排班

> 版本：4.26.0（2026-11-23）
> 主题：一流程多定时（独立时区）与 Webhook Secret 轮换
> 状态：🚧 待发布
> 方案：[README](./README.md) · [规格](./spec.md) · [契约](./contracts.md) · [任务](./tasks.md)
> 发行说明：[v4.26.0-release-notes.md](../../roadmap/v4.26.0-release-notes.md)

## 1. 交付结论

v4.26 把触发配置层从「一个流程一只闹钟」升级为「一张班表」：

- 一个流程最多 5 条定时，各自独立的 cron、IANA 时区、入参与启停；
- 调度器按每条定时声明的时区推进下一次执行，DST 语义明确；
- Webhook Secret 可原地轮换，URL 不变，旧钥即时失效。

可靠性语义（逐次补齐、事件重试/死信、心跳、运行治理、安全沙箱、HMAC）全部留给 v5.0「会兜底」。

## 2. 功能清单

- 多定时 CRUD：`GET/POST /api/flows/:id/schedules`、`PATCH/DELETE /:scheduleId`；
- 立即运行：`POST /api/flows/:id/schedules/run`，可指定某条定时并回写其 `last_*`；
- 时区：每条定时固化 IANA 时区；服务端用内置 Intl 计算墙钟与偏移，DST 跳跃跳过、重复只跑一次；
- 调度：30s tick + 启动补跑一次；同一流程多条同时到点仍单飞，后到者 `skipped_busy`；
- Secret 轮换：`POST /api/flows/:id/triggers/:triggerId/rotate`，复用触发器 id 与 URL，仅替换哈希；
- 编辑器：定时列表 + 新建/编辑表单（名称、cron、时区、启停），逐条运行/编辑/删除；Webhook 行可轮换 Secret；
- i18n：定时与触发中英文案同步。

## 3. 数据与契约

- 迁移 v056 重建 `workflow_schedules`：去 `workflow_id UNIQUE`，新增 `name`、`timezone`，双索引；
- 旧行保留，`timezone` 回填 `Asia/Shanghai`；`LATEST_SCHEMA_VERSION = 56`；
- 上限：每流程 5 条；名称 ≤40、cron ≤120、时区 ≤64；
- `FlowScheduleView` 新增 `name` / `timezone`；
- shared 新增 `FLOW_SCHEDULE_LIMIT`、`isValidTimeZone`、`nextCronTimeInZone`。

## 4. 时区与调度语义

- 墙钟域搜索：月 → 日 → 时 → 分跳进，避免逐分钟扫描；
- 墙钟 → UTC 两次偏移收敛，并回读校验；
- 春季不存在时刻跳过；秋季重复时刻只执行一次；
- cron / 时区永久无效时记录 `error` 并自动停用该条，避免重复失败；
- 切换 cron 或时区、或由停用转启用时立即重算 `next_run_at`；仅改名/改入参不移动下次时间。

## 5. 关键文件

| 层 | 文件 |
|---|---|
| 契约 | `packages/shared/src/schemas/flow/schedule.ts`、`schemas/flow/timezone/schedule-zone.ts`、`types/flow.ts` |
| 数据 | `packages/database/src/migrations/v056-multi-schedules.ts`、`repositories/workflow/workflow-schedule-repo.ts`、`repositories/trigger/workflow-trigger-repo.ts` |
| 核心 | `packages/core/src/flow/schedule/{schedule-service,scheduler}.ts`、`packages/core/src/flow/trigger/trigger-service.ts` |
| Web | `apps/web/src/app/api/flows/[id]/schedules/*`、`app/api/flows/[id]/triggers/[triggerId]/rotate/route.ts`、`lib/hooks/flows/use-flow-schedule.ts` |
| UI | `apps/web/src/features/flow-editor/schedule/*`、`features/flow-editor/trigger/{trigger-dialog,trigger-list}.tsx` |

## 6. 验证

- `pnpm check` 通过（typecheck/lint/行数/结构/循环/MSW/ASCII/资产/surface/E2E 隔离）；
- `pnpm verify:local` 通过；
- `pnpm test` 全绿：shared 42（flow schema）、database v056/v054/仓储、core 28（schedule/trigger）、web 6（路由）+ 3（helper）；
- 迁移版本断言全部同步到 56。

## 7. 已知边界

- 错过多个周期仍只补一次；
- 定时入参目前仅 API 可写，编辑器未提供 JSON 编辑；
- 不做 HMAC、事件重试/死信、触发器心跳；
- 不做运行保留、失败通知与统一观测面板；
- 不做安全沙箱与运行治理；
- 以上均纳入 v5.0「会兜底」。

## 8. 后续方向

- v5.0：补偿队列与批量重放、跨版本运行迁移、触发器心跳、Agent 写工具接入无人值守门、审批审计产品化；
- 触发层可继续做统一观测与失败通知，但不阻塞 v5.0 主题。
