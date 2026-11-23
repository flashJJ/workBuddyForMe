# v4.26 任务：会排班

> 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md)
> 约定：每完成一项勾选；迁移版本断言统一 56；单文件 ≤300 行。

## M0 计划与索引

- [x] M0.1 创建 `docs/plan/v4.26/{README,spec,contracts,tasks}.md`
- [x] M0.2 更新 `docs/plan/README.md` v4 列表
- [x] M0.3 更新 `docs/roadmap/README.md` 版本表
- [x] M0.4 更新 `docs/roadmap/scheduled/README.md`
- [x] M0.5 更新 `docs/plan/v5.0/{README,backlog-inventory}.md` 的 v4.26 范围

## M1 shared

- [x] M1.1 `schemas/flow/schedule-zone.ts`：`isValidTimeZone`、`nextCronTimeInZone`、DST 跳过
- [x] M1.2 `schemas/flow/schedule.ts`：导出 `cronMatchesParts` / `cronDayMatches`；新增 create/update/run schema 与 `FLOW_SCHEDULE_LIMIT`
- [x] M1.3 `types/flow.ts`：`FlowScheduleView` 增加 `name` / `timezone`
- [x] M1.4 单测：IANA 校验、上海/纽约、DST 前后、不存在时刻、5 年无解、schema 默认值与空更新

## M2 database

- [x] M2.1 迁移 `v056-multi-schedules.ts`（重建表、复制旧行、双索引）+ 注册与 `LATEST_SCHEMA_VERSION=56`
- [x] M2.2 定时仓储：`listByWorkflow/getById/countByWorkflow/create/update/remove`，保留 `listDue/claimDue/recordOutcome`
- [x] M2.3 触发器仓储：`rotateSecret`
- [x] M2.4 测试：v056 迁移（旧行保留、UNIQUE 消失、默认时区）、v054 改为迁移到 54、多定时 CRUD/计数/认领、轮换哈希
- [x] M2.5 全仓迁移断言 55→56

## M3 core

- [x] M3.1 定时服务：list/create/update/remove/runNow（上限、时区重算、归属校验）
- [x] M3.2 调度器：按条目 `timezone` 计算下次时间
- [x] M3.3 触发器服务：`rotateSecret`（仅 Webhook、一次性返回）
- [x] M3.4 测试：上限、时区、仅改名不移动、启用未发布、指定条目立即运行、多条目同时到期、轮换

## M4 Web

- [x] M4.1 `api/flows/[id]/schedules/route.ts`：GET / POST
- [x] M4.2 `api/flows/[id]/schedules/[scheduleId]/route.ts`：PATCH / DELETE
- [x] M4.3 `api/flows/[id]/schedules/run/route.ts`：POST
- [x] M4.4 `api/flows/[id]/triggers/[triggerId]/rotate/route.ts`：POST
- [x] M4.5 删除旧 `/schedule`、`/schedule/run` 路由
- [x] M4.6 `endpoints/work.ts`、`endpoints.ts`、`use-flow-schedule.ts` 更新
- [x] M4.7 路由测试：成功路径、404/409/422、轮换 Secret

## M5 UI 与 i18n

- [x] M5.1 `schedule-dialog.tsx` 改为列表 + 新建/编辑（时区下拉/自定义 IANA、上限提示、逐条运行/删除）
- [x] M5.2 触发器对话框增加轮换按钮与二次确认（拆分列表子组件，控制行数）
- [x] M5.3 i18n：`flowEditor.schedule.*` / `flowEditor.trigger.*` 中英同步
- [x] M5.4 前端 helper 单测（时区选项、默认值）

## M6 门禁与发布

- [x] M6.1 `pnpm check`
- [x] M6.2 `pnpm verify:local`
- [ ] M6.3 版本总结、发行说明、博客、版本号 4.26.0
- [ ] M6.4 合并 main、tag、安装包与 Release
