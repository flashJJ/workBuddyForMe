# v4.25 版本总结：会来事

> 版本：4.25.0（2026-11-23）
> 主题：Webhook 与本地文件监听触发
> 状态：✅ 已发布（tag `v4.25.0`，GitHub Release 最新版）
> 安装包：`WorkBuddyForMe-Setup-4.25.0.exe`（274.52 MB，SHA256 `20e125b2…ee6ed27c`）
> 方案：[README](./README.md) · [规格](./spec.md) · [契约](./contracts.md) · [任务](./tasks.md)
> 发行说明：[v4.25.0-release-notes.md](../../roadmap/v4.25.0-release-notes.md) · Release：https://github.com/flashJJ/workBuddyForMe/releases/tag/v4.25.0

## 1. 交付结论

v4.25 把「事件到达 → 流程开始」接通：外部系统可以 POST 一个本机 Webhook，或由本地目录的新文件触发流程；两类触发都持久化配置、复用单飞保护、按无人值守处理，并在编辑器中可视化配置。

与 v4.24 的定时触发形成完整的两类自动化入口：

| 入口 | 触发源 | 运行 trigger |
|---|---|---|
| 定时 | cron | `schedule` |
| 事件 | Webhook / 本地文件 | `webhook` / `file` |

## 2. 功能清单

- Webhook 触发器：每流程可建多条，独立 Bearer Secret（只存 SHA-256，仅创建时返回一次）；
- Webhook 公开路由：仅回环 Host 可达、30 次/分钟、256KB body、可选 `Idempotency-Key`；
- 文件触发器：目录递归监听、扩展名白名单、800ms 防抖、同路径 2s 去重、启动重建、禁用/删除即释放；
- 统一触发执行服务：发布校验、单飞（`hasActiveRun`）、状态回写（created/skipped_busy/error/disabled）；
- 运行入参约定：Webhook body 顶层合并 + 原始 `payload`；文件事件提供 path/name/ext/eventType；
- 新增运行 trigger 值 `webhook` / `file`，与 schedule 一样注入 `deny_all`；
- 编辑器「触发」对话框：创建/启停/删除、Webhook URL 与一次性 Secret 展示、最近触发状态；
- 运行中心补齐 `schedule`（v4.24 缺口）、`webhook`、`file` 文案。

## 3. 数据与契约

- 迁移 v055 `workflow_triggers`（纯加法）：kind、config_json、secret_hash、last_* 与两个索引；
- `LATEST_SCHEMA_VERSION = 55`；
- `FLOW_TRIGGERS` 扩展为 7 个值；新增无人值守判定 `isUnattendedFlowTrigger`；
- 触发器上限：每流程 10 条，Webhook ≤5、文件 ≤5。

## 4. 安全模型

- Secret 只在创建响应出现一次，库内只存哈希，比较使用 `timingSafeEqual`；
- 公开路由复用回环 Host 守卫，不接受托管 token/cookie；
- body 上限与 JSON 对象校验，拒绝数组与超大请求；
- `webhook/file` 运行 `interactive=false` 且写/危险工具默认拒绝；agent 桌面工具域同样禁单；
- 文件路径必须是存在的绝对目录，拒绝磁盘根目录。

## 5. 关键文件

| 层 | 文件 |
|---|---|
| 契约 | `packages/shared/src/schemas/flow/trigger.ts`、`packages/shared/src/types/trigger/index.ts` |
| 数据 | `packages/database/src/migrations/v055-flow-triggers.ts`、`repositories/trigger/workflow-trigger-repo.ts` |
| 核心 | `packages/core/src/flow/trigger/{trigger-auth,trigger-service,file-watcher}.ts` |
| Web | `apps/web/src/lib/server/flows/flow-trigger-wiring.ts`、`app/api/public/flows/triggers/[triggerId]/route.ts`、`app/api/flows/[id]/triggers/*` |
| UI | `apps/web/src/features/flow-editor/trigger/trigger-dialog.tsx`、`flow-toolbar.tsx` |

## 6. 验证

- `pnpm check` 通过（typecheck/lint/行数/结构/循环/MSW/ASCII/资产/surface/E2E 隔离）；
- `pnpm verify:local` 8/8 tasks 通过（eval/perf/unit/integration/build:web）；
- 新增单测：共享 schema 3、迁移 2、仓储 3、触发服务 7、文件监听 4、对话框 helper 3、公开路由 5、管理 API 2；
- 迁移版本断言全部同步到 55；数据库覆盖率保持阈值以上。

## 7. 已知边界

- 不做公网暴露、HMAC 签名、可视化字段映射、文件内容 diff；
- 幂等键为进程内短期去重（10 分钟/500 条），重启后不保留；
- 非 Windows/macOS 平台文件监听降级为根目录，状态会记录平台限制；
- 事件触发失败不做自动重试，只记录状态供用户处理。

## 8. 后续方向

- HMAC 签名与 Secret 轮换；
- 多触发器独立变量映射与条件过滤；
- 事件重试与死信；
- 与端点同步调用的统一观测面板。
