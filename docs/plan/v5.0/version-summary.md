# v5.0 版本总结：会兜底

> 版本：5.0.0（2026-11-24）
> 主题：**会兜底**——跑得住、错了能收、危险能拦、事后能查
> 状态：✅ 已发布（tag `v5.0.0`，GitHub Release 最新版）
> 安装包：`WorkBuddyForMe-Setup-5.0.0.exe`（258.65 MB，SHA256 `ca1cf21a…edff23`）
> 方案：[README](./README.md) · [规格](./spec.md) · [契约](./contracts.md) · [任务](./tasks.md)
> 发行说明：[v5.0.0-release-notes.md](../../roadmap/v5.0.0-release-notes.md) · Release：https://github.com/flashJJ/workBuddyForMe/releases/tag/v5.0.0

## 1. 交付结论

v5.0 把 Flow 从「能跑、能定时、能被事件唤醒」推进到「跑得住」：无人值守失败会进入补偿队列并自动重试，运行中心可批量重放失败；运行创建时固化流程图快照，升级后旧运行按原图续跑；运行历史有了保留与清理策略，触发器停摆有健康面板可查；Agent 内部写工具在无人值守下统一走流程级门控，Webhook 支持 HMAC 验签。

五条能力对应 R1–R3、S1–S2，全部落在 `docs/plan/v5.0/tasks.md` 的 M1–M7 中，M8 完成门禁与发布收尾。

## 2. 功能清单

### R1 失败可收：补偿队列与批量重放

- 错误分类：`config/auth/network/timeout/rate_limit/tool/data/version/unknown`，仅 network/timeout/rate_limit 可自动重试；
- 补偿队列：仅 `api/mcp/schedule/webhook/file` 触发且 `failed` 的运行进入；原运行 + 最多 3 次重试，退避 30s / 2m / 10m；
- 单飞顺延：同流程有在途运行时补偿顺延，不消耗尝试次数；
- 状态机：`pending → retrying → recovered / exhausted / cancelled`，流程停用或删除取消；
- 批量重放：运行中心多选 ≤20 条，整体或从失败节点，逐条返回结果，部分失败不阻断；
- 错误建议：运行中心展示类别、原因与下一步建议，失败不再只有一句 message。

### R2 跨版本可续：运行图快照

- `createRun` 写入 FlowGraph canonical JSON 与 SHA-256；
- 续跑/重放优先用快照，其次按 `run.version` 精确取版本，缺失时抛 `flow/run-graph-unavailable` 并收敛 `interrupted`，不静默使用当前生产图；
- 运行详情返回 `versionCheck`，展示新增/删除/改类型节点；
- 单条重放支持 `snapshot/latest`，`latest` 下失败节点不存在时 409 拒绝。

### R3 运行可治理：保留清理与触发器健康

- 保留策略：成功 30 天、失败 90 天、每流程最多 500 条，可在设置页调整；
- 清理：只删终态，排除 `pending/retrying` 补偿引用，分批 ≤200，支持 dry-run 与审计 `flow_retention_cleanup`；
- 健康面板：调度心跳（3×30s 判 stalled）、文件监听状态、补偿计数、端点、定时 missed、触发器最近触发与保留统计；
- 定时错过计数：`missed_count` 上限 100、`last_missed_at`，仍只补跑一次。

### S1 执行前拦截：Agent 写工具门控

- 仅 `api/mcp/schedule/webhook/file` 注入 `toolGate`，`manual/chat` 保持原审批链；
- executor 在工具暴露前按流程级 `evaluateUnattendedPolicy` 过滤，拒绝写 `flow_agent_tool_denied` 审计并返回结构化工具错误。

### S2 触发入口验真：Webhook HMAC

- `authMode=bearer|hmac|both`，HMAC 使用 `x-wbfm-timestamp` 与 `x-wbfm-signature=hex(HMAC-SHA256(secret, timestamp+"."+rawBody))`，300s 时间窗；
- 公开路由先 clone 读原始 body，再 `JSON.parse`；
- 密钥密文存 `secret_cipher`（本机 `SecretCipher`），轮换同时更新 hash 与 cipher，旧钥立即失效；
- 旧触发器启用 HMAC 前必须轮换，缺密文时明确拒绝。

## 3. 数据与契约

- 迁移 v057：`workflow_runs` 增 `graph_snapshot_json/graph_hash/replay_batch_id`；新表 `flow_run_compensations`；`workflow_schedules` 增 `missed_count/last_missed_at`；`workflow_triggers` 增 `secret_cipher`；
- `LATEST_SCHEMA_VERSION = 57`，全仓迁移断言统一；
- shared 新增 `run-reliability` 类型与 schema、canonical JSON helper、批量/补偿/保留/鉴权常量；
- 审计新增 `flow_compensation_scheduled`、`flow_compensation_exhausted`、`flow_retention_cleanup`、`flow_agent_tool_denied`；
- i18n 新增 `flowRuns.stats/health/batch/version/compensation/retention` 与 `flowEditor.trigger.authMode`，中英同步。

## 4. 关键语义

- 补偿一行对应一条失败链，`attempt` 表示「下一次重试编号」；busy 顺延不消耗次数；
- 批量重放不建补偿行，批次 id 仅追溯，不保证幂等；
- 快照只写一次；列表不读快照，避免列表接口变大；
- 清理先按时间再按每流程上限；dry-run 不删不审计；
- 健康只读展示，不自动停用有效触发器；
- Agent 门控拒绝不抛异常，返回工具错误并审计，避免只丢在节点错误里。

## 5. 关键文件

| 层 | 文件 |
|---|---|
| 契约 | `packages/shared/src/types/flow-reliability/index.ts`、`schemas/flow/run-reliability.ts`、`i18n/messages/flow-runs.ts` |
| 数据 | `migrations/v057-run-reliability.ts`、`repositories/workflow/workflow-run-repo.ts`、`repositories/compensation/flow-run-compensation-repo.ts` |
| 核心 | `flow/reliability/{failure-classifier,run-snapshot,run-replay-service,compensation-service,retention-service,runtime-health-service}.ts`、`flow/run/run-recovery.ts` |
| API | `app/api/flow-runs/{replay-batch,health,cleanup,retention}/route.ts`、`app/api/flows/runs/[id]/{route,replay/route}.ts`、`api/public/flows/triggers/[triggerId]/route.ts` |
| UI | `features/flows/flow-runs-{view,batch-bar,health,row}.tsx`、`features/flow-execution/execution-panel.tsx`、`features/settings/storage/retention/run-retention-panel.tsx`、`features/flow-editor/trigger/*` |
| 装配 | `lib/server/flows/{flow-runner,flow-runtime,flow-reliability}-wiring.ts`、`lib/server/container.ts` |

## 6. 验证

- `pnpm check` 通过（typecheck/lint/行数/结构/循环/MSW/ASCII/资产/surface/E2E 隔离）；
- `pnpm verify:local` 通过；
- Release workflow `45251220220` 成功；
- 单测覆盖：错误分类、canonical 哈希、快照优先/版本回退/缺失阻断、补偿退避与耗尽、批量部分失败、保留边界与 dry-run、健康阈值与 missed、Agent 门控、HMAC 合法/错误/过期/轮换；
- 迁移 v057 测试覆盖旧行兼容与索引，版本断言 57。

## 7. 已知边界

- 不做 OS 级安全沙箱、目录白名单、执行前文件快照回滚；
- 不做独立通知中心、邮件/IM/出站 Webhook 通知；
- 不做自动改写流程图或自动跨版本节点映射；
- 不做分布式调度与多进程互斥；
- 定时错过仍只补跑一次，仅记录次数；
- 批量重放上限 20，补偿上限 3 次，均为固定策略；
- 旧触发器启用 HMAC 前必须轮换 Secret。

## 8. 后续方向

- v5.1 评估 OS 级沙箱、目录白名单与危险动作回滚；
- 运行治理可扩展为统一观测面板与失败通知；
- 补偿策略未来可做成按流程配置，但不在 v5.0 引入。
