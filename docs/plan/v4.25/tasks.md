# v4.25 任务：会来事

> 依据：[spec.md](./spec.md) 与 [contracts.md](./contracts.md)
> 顺序：M0 → M6；每个里程碑完成后跑定向测试，M6 跑全量门禁。

## M0 选题与契约冻结

- [x] `docs/plan/v4.25/README.md` 选题与范围
- [x] `docs/plan/v4.25/spec.md` 规格与里程碑
- [x] `docs/plan/v4.25/contracts.md` 类型/DB/HTTP/上限契约
- [x] `docs/roadmap/scheduled/v4.25-01-event-triggers.md` 来源方案
- [x] 评审确认（Non-Goals、Secret 方案、入参约定）——2026-11-23，四项均按推荐方案冻结，记录见 spec §13

## M1 shared 契约与数据层

- [x] `packages/shared/src/schemas/flow/trigger.ts`：kind 判别、文件配置、创建/更新 schema
- [x] `packages/shared/src/types/trigger/index.ts`：`FLOW_TRIGGERS` 增 `webhook/file`；触发器视图与无人值守判定
- [x] `packages/database/src/migrations/v055-flow-triggers.ts`：建表 + 两索引
- [x] `packages/database/src/migrations/runner.ts`：注册 55，`LATEST_SCHEMA_VERSION = 55`
- [x] `packages/database/src/repositories/trigger/workflow-trigger-repo.ts`：CRUD、listByWorkflow、listEnabledByKind、recordOutcome
- [x] 导出：`packages/database/src/index.ts`、仓储 barrel
- [x] 测试：触发器 schema、v055 迁移、仓储 CRUD/级联
- [x] 同步所有 `migrations/*.test.ts` 的版本断言与 `applied` 列表（53/54 → 55）

验收：`pnpm --filter @wbfm/database test:unit` 与 shared 测试通过，覆盖率不低于阈值。

## M2 触发执行服务

- [x] `packages/core/src/flow/trigger/trigger-auth.ts`：`generateWebhookSecret`、`hashSecret`、`verifySecret`
- [x] `packages/core/src/flow/trigger/trigger-service.ts`：
  - 列表/创建/更新/删除（发布校验、数量上限、路径与扩展名校验）
  - Webhook 鉴权与入参合并（保留键）
  - 单飞（`hasActiveRun`）、未发布拒绝、状态回写
  - 幂等键（500 条/10 分钟/懒清理）
  - 文件事件触发
- [x] `packages/core/src/flow/trigger/index.ts` 与 `packages/core/src/flow/index.ts` 导出
- [x] `run-options.ts`：`webhook/file` 注入 `deny_all`
- [x] `engine-node.ts` / `engine-agent.ts`：unattended 增 `webhook/file`
- [x] 测试：Secret、入参合并、busy、幂等、未发布、文件入参、无人值守拒绝

验收：schedule 既有测试全绿；新增服务测试覆盖所有 FireResult 分支。

## M3 文件监听器

- [x] `packages/core/src/flow/trigger/file-watcher.ts`：默认 fs adapter + 可注入接口
- [x] 递归监听、非递归平台降级
- [x] 扩展名白名单、忽略目录/临时文件
- [x] 800ms 防抖 + 2s 同路径去重 + 每触发器单飞
- [x] `reconcile()` 新增/移除/配置变化；`dispose()` 幂等
- [x] 测试：假 adapter 覆盖过滤、防抖、忙碌、重建、释放

验收：`pnpm --filter @wbfm/core test:unit` 通过；不产生真实文件监听副作用。

## M4 Web 接入

- [x] `apps/web/src/lib/server/public-route.ts`：`definePublicTriggerRoute`（Host → Secret → 限流）
- [x] `apps/web/src/app/api/public/flows/triggers/[triggerId]/route.ts`：POST，body 上限、JSON 校验、幂等头、映射错误码
- [x] `apps/web/src/app/api/flows/[id]/triggers/route.ts`：GET/POST
- [x] `apps/web/src/app/api/flows/[id]/triggers/[triggerId]/route.ts`：PATCH/DELETE
- [x] `apps/web/src/lib/server/flows/flow-trigger-wiring.ts`：仓储 + 服务 + watcher；`NODE_ENV !== 'test'` 启动
- [x] `container.ts` / `container-types.ts`：`flowTriggers`
- [x] `testing/reset/route.ts`：重置前 `watcher.dispose()`
- [x] 测试：401/403/404/409/413/415/422/429/202、幂等、管理 API 增删改

验收：路由测试全绿；E2E 重置后无残留监听。

## M5 UI 与文案

- [x] `apps/web/src/lib/hooks/flows/use-flow-triggers.ts` + endpoints
- [x] `apps/web/src/features/flow-editor/trigger/trigger-dialog.tsx` + `index.ts`
- [x] `flow-toolbar.tsx` Zap 入口；`editor-shell.tsx` / `flow-editor.tsx` 状态与 props
- [x] i18n：`packages/shared/src/i18n/messages/flow-editor-trigger.ts`（+en），合并进 `flow-editor` 命名空间
- [x] 运行中心：`flow-runs-view.tsx` 的 `TRIGGER_KEYS` 补 `schedule/webhook/file`；`flows.ts` 中英文案补齐 `schedule`（v4.24 缺口）
- [x] helper 单测：Webhook URL 拼接、扩展名解析、表单默认值

验收：编辑器可创建/启停/删除两类触发器；Webhook Secret 仅展示一次；运行中心文案完整。

## M6 验证、文档与发布

- [x] `pnpm check`
- [x] `pnpm verify:local`
- [x] 定向回归：`engine*`、`schedule*`、`queue/*`、迁移版本断言
- [x] `docs/plan/v4.25/version-summary.md`
- [x] `docs/roadmap/v4.25.0-release-notes.md`
- [x] `blog/v4.25/` 7 篇 + `blog/README.md`
- [x] 版本号 4.25.0（root/web/desktop/shared version.ts）
- [ ] 合并 main、tag `v4.25.0`、双远端推送
- [ ] 安装包构建与归档、GitHub Release
- [ ] 更新 `docs/plan/README.md`、`docs/roadmap/README.md`、`docs/roadmap/scheduled/README.md` 状态
