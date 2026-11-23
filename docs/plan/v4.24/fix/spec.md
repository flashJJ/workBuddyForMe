# v4.24 迭代联动缺陷修复 Spec

## 1. 背景

v4.22（并行编排）、v4.23（持久化执行）、v4.24（定时触发）三轮迭代连续落地。本次对三轮改动做交叉静态排查，定位"单版本内自洽、跨版本联动失配"的缺陷。排查不新增功能，只修联动。

## 2. 排查范围与方法

- 执行链：`engine.ts` / `engine-parallel.ts` / `engine-node.ts` / `engine-agent.ts`
- 恢复链：`checkpoint.ts` / `resume-policy.ts` / `recovery-scanner.ts` / `run-service.ts`
- 调度链：`schedule.ts` / `schedule-service.ts` / `scheduler.ts` / `flow-schedule-wiring.ts`
- 装配与生命周期：`container.ts` / `container-types.ts` / `testing/reset/route.ts` / `server-scheduler.ts`
- 编辑器保存链：`graph-utils.ts` / `flow-editor.tsx` / `editor-shell.tsx`
- 数据契约：`flow.ts`（parallelism）、`v054-flow-schedules.ts`、`workflow-schedule-repo.ts`
- 校验：现有单测覆盖情况 + `pnpm check` / `pnpm verify:local`

## 3. 结论总表

| 编号 | 严重度 | 问题 | 联动来源 | 处理 |
|---|---|---|---|---|
| F1 | P0 | 编辑器保存会静默丢失图字段 `parallelism`，并行图保存后退化为串行 | v4.22 新字段 × 既有编辑器 | 修复 |
| F2 | P0 | 定时触发（`trigger='schedule'`）未接入无人值守安全门，写/危险工具可能被自动放行，agent 可用桌面工具 | v4.24 新 trigger × v0.9 策略门 | 修复 |
| F3 | P1 | 定时调度器随容器无条件启动，测试与 E2E 重置不停止，残留定时器访问已关闭数据库 | v4.24 定时器 × 容器生命周期 | 修复 |
| F4 | P1 | SSE 去重键只含 `type:nodeId`，v4.23 重试产生的第二次 `node_started` 被丢弃，重试徽标与 attempt 状态不生效 | v4.23 重试 × v4.22 前既有 SSE 去重 | 修复 |
| F5 | P1 | 人工挂起解除后运行状态未回 `running`，审批后写操作在途时崩溃会被恢复矩阵当作纯等待而跳过在途安全检查 | v4.23 恢复矩阵 × v0.9 人工挂起 | 修复 |
| R1 | P2 | cron 解析失败分支不推进 `next_run_at`，损坏记录会每 tick 报错 | v4.24 | 不修（见 §7） |
| R2 | P2 | 「立即运行」复用 `trigger='schedule'`，含 human 节点的流程会直接失败 | v4.24 | 不改语义（见 §7） |

## 4. F1：编辑器保存丢失 `parallelism`

### 4.1 证据

- `packages/shared/src/schemas/flow/flow.ts:145` 新增可选字段 `parallelism`（1–4）。
- `apps/web/src/features/flow-editor/canvas/graph-utils.ts:74-95` `fromDomain` 只返回 `{ nodes, edges }`，不读 `parallelism`。
- `apps/web/src/features/flow-editor/canvas/graph-utils.ts:98-120` `toDomain` 只写 `nodes/edges/viewport`，不写 `parallelism`。
- `apps/web/src/features/flow-editor/base/flow-editor.tsx:139` 保存/校验统一走 `toDomain(nodes, edges, viewport)`。
- `fromDomain` 全仓仅 `flow-editor.tsx:74` 一处调用；`toDomain` 仅 `flow-editor.tsx:139` 一处调用，改动面可控。

### 4.2 根因

v4.22 只把 `parallelism` 加到 schema、编译器和引擎，未回补编辑器的"领域图 ↔ 画布"双向映射。编辑器加载时丢弃该字段，任何一次保存都会用不含该键的新图覆盖版本。

### 4.3 修复方案

1. `graph-utils.ts` `fromDomain`：返回值增加 `parallelism: number`，取值 `graph.parallelism ?? 1`。
2. `graph-utils.ts` `toDomain`：签名改为
   `toDomain(nodes, edges, viewport?, parallelism?: number): FlowGraph`，
   仅当 `parallelism !== undefined && parallelism > 1` 时写入 `parallelism` 键，保证旧图（缺省/为 1）保存后字节不变。
3. `flow-editor.tsx`：
   - 新增 `const [parallelism, setParallelism] = React.useState(1)`；
   - 加载 effect 中 `setParallelism(canvas.parallelism)`；`emptyCanvas()` 分支 `setParallelism(1)`；
   - `buildGraph` 改为 `toDomain(nodes, edges, viewport, parallelism)`。

### 4.4 验收标准

- 打开 `parallelism=3` 的流程，不动作直接保存 → 新版本图仍为 3。
- 打开缺省 `parallelism` 的流程保存 → 新版本图不含 `parallelism` 键。
- 校验（validate）路径同样不丢字段。
- 新增 `graph-utils.test.ts`：`fromDomain` 读取、`toDomain` 保留、`parallelism=1` 不写键。

## 5. F2：定时触发未接入无人值守安全门

### 5.1 证据

- `docs/plan/v4.24/contracts.md:107` 明确约定：定时运行"非交互；写/危险 tool 默认拒绝"。
- `packages/core/src/flow/engine/engine-node.ts:78`：`const unattended = ctx.trigger === 'api' || ctx.trigger === 'mcp';`
  `schedule` 走第 86 行 `checkToolAllowed` 普通权限判断。
- `packages/core/src/flow/engine/engine-agent.ts:34-37`：同样只识别 api/mcp，定时运行的 agent 节点可携带 `desktop` 工具域。
- `packages/core/src/flow/run/run-options.ts:35-39`：只有 api/mcp 注入 `unattendedPolicy`，schedule 无策略。

### 5.2 根因

v0.9 的无人值守判定写死为 `api | mcp`。v4.24 新增 `schedule` 触发时只设置了 `interactive=false`，未接入同一策略门。`interactive=false` 只保证不弹窗挂起，不保证拒绝；若用户在权限设置里已全局允许某写工具，`checkToolAllowed` 返回 true，定时运行会无人值守执行写操作。

### 5.3 修复方案

1. `run-options.ts`：
   - `api | mcp` 分支保持端点策略快照；
   - 新增 `trigger === 'schedule'` 分支，注入 `unattendedPolicy = { mode: 'deny_all' }`（无端点，安全兜底全拒绝）。
2. `engine-node.ts:78`：`unattended` 增加 `|| ctx.trigger === 'schedule'`。
3. `engine-agent.ts:34`：同上。

### 5.4 目标行为

| 场景 | 期望 |
|---|---|
| schedule + 只读 tool | 正常执行 |
| schedule + 写/危险 tool | `evaluateUnattendedPolicy(deny_all)` 拒绝，产出 `ok:false` 的 denied 输出，流程继续 |
| schedule + agent + desktop scope | 抛 `desktop_control_banned` |
| manual / chat | 行为不变（原有内联确认） |
| api / mcp | 行为不变（端点策略快照） |
| schedule 运行中断后续跑 | 续跑仍注入 deny_all，不因恢复而放宽 |

### 5.5 验收与测试

- 新增 core 单测：schedule + 写工具 → 拒绝；schedule + 只读工具 → 执行；api/mcp 用例保持通过。
- 新增 core 单测：schedule + agent + desktop → 抛错。
- 既有 `engine*.test.ts` 全绿。

## 6. F3：定时调度器生命周期未纳入测试与重置清理

### 6.1 证据

- `apps/web/src/lib/server/flows/flow-schedule-wiring.ts:31-38`：`if (params.start !== false) scheduler.start();`，调用方均未传 `start`。
- `apps/web/src/lib/server/container.ts:248`：`createFlowScheduleWiring({ db, workflows, runs: flowRuns, flowRunner })`，`build()` 同时服务生产、测试与 E2E。
- `apps/web/src/app/api/testing/reset/route.ts:50-59`：只 `stopServerScheduler()`、`flowRunner.dispose()`、`services.db.close()`，未停止 flow schedule scheduler。
- `container.ts:296` `__buildContainerForTest` 直接复用 `build()`，十余个 web 单测会各自启动一个真实 30s 定时器。

### 6.2 影响

- 测试进程内残留真实定时器，30s 后访问已关闭/已删除的 SQLite 连接，持续告警。
- E2E 重置后旧定时器仍闭包旧库；重建容器又启动新实例，实例累积。`claimDue` 原子条件可防重复创建运行，但泄漏与错误日志确定存在。

### 6.3 修复方案

1. `flow-schedule-wiring.ts`：`start` 缺省值改为 `params.start ?? process.env.NODE_ENV !== 'test'`；显式传入优先。
2. `testing/reset/route.ts`：在 `stopServerScheduler()` 之后调用 `services.flowSchedules.scheduler.dispose()`（`dispose` 已幂等）。
3. `container.ts` 无需改动（走环境缺省）。

### 6.4 验收标准

- `NODE_ENV=test` 下构建容器不启动定时器；生产/dev 正常启动。
- E2E reset 后日志不再出现 `[flow-schedule] 调度 tick 失败`。
- `pnpm check` 与 `pnpm verify:local` 通过。

## 7. 本次不修项

- **R1 cron 损坏记录重复报错**：`scheduler.ts:60-67` 解析失败时不推进 `next_run_at`。但 `upsert` 已强校验，正常路径不可达，只有外部篡改数据库才会触发。为避免引入额外仓储方法与迁移，本轮不处理，记录为已知边界。
- **R2「立即运行」语义**：`schedule-service.ts:60-68` 复用 `trigger='schedule'`，含 human 节点的流程会因非交互直接失败。这与 v4.24 契约一致（定时运行即无人值守），属于设计取舍；如产品需要"以手工方式立即运行"，应单独立项增加 `trigger='manual'` 的立即运行入口。
- **R3 并行度编辑入口**：本轮只保证 `parallelism` 不丢失。图编辑器是否提供并行度设置 UI 取决于产品需求，不在缺陷修复范围。

## 8. 验证计划

```powershell
pnpm --filter @wbfm/core test
pnpm --filter @wbfm/web test
pnpm check
pnpm verify:local
```

重点关注：`engine*.test.ts`、`schedule*.test.ts`、数据库迁移版本号断言、单文件行数门禁。

## 9. 风险与回滚

- F1 只增加可选字段读写；`parallelism<=1` 不写键，旧版本数据与快照不变化，可单独回滚。
- F2 改变的是 schedule 触发的工具授权路径；若线上已依赖"定时任务执行写工具"，升级后会被拒绝，需要改为人工触发或显式产品决策。这是契约要求的安全收紧，需在变更说明中标注。
- F3 仅调整启动条件与重置清理，不影响生产调度行为。
- 整体回滚方式：按三个提交分别 revert。

## 10. 第二轮排查补充修复（F4 / F5）

### 10.1 F4：SSE 去重吞掉重试事件

- 证据：`apps/web/src/lib/hooks/flows/use-flows-helpers.ts` 原 `flowEventDedupeKey` 仅返回 `${type}:${nodeId}`；`use-flows.ts:217` 同一订阅内按该键去重。v4.23 重试会重复发 `node_started`（带 `attempt`），第二次起被静默丢弃，`execution-timeline` 的「重试 ×N」与 `nodeAttempts` 永不生效。
- 修复：节点事件去重键追加 `#attempt`（无 attempt 时保持原键）；run 级事件仍按 type。
- 验收：新增 `use-flows-helpers.test.ts`；重试 `node_started` 能写入 `nodeAttempts`。

### 10.2 F5：挂起解除后状态未回 running

- 证据：`run-store.ts` 收到 `node_waiting_human` 调 `runs.markWaitingHuman`，但之后没有任何路径把状态改回 `running`；`resume-policy.ts:61` 对 `waiting_human` 直接判定可续跑，跳过 `unsafe_in_flight` 检查（第 63-71 行）。
- 影响：人工批准后流程继续执行写工具/agent 时若进程崩溃，恢复矩阵会把运行当成「纯等待」自动续跑，可能重复副作用。v4.24 定时触发（非交互、人工节点/写工具自动拒绝）会频繁进入该状态，风险放大。
- 修复：
  1. `workflow-run-repo.ts` 新增 `clearWaitingHuman(id, nodeId)`，带 `status='waiting_human' AND wait_node_id=nodeId` 条件，只清对应节点，避免并行分支误清；
  2. `run-store.ts` 在 `node_succeeded` / `node_failed` / `node_skipped` 后调用（覆盖非交互自动拒绝与人工提交后的落定）；
  3. `run-service.ts` 的 `submitHuman` / `submitToolConfirmation` 在等待项成功解析后立即调用（覆盖审批后写操作仍在途的崩溃窗口）。
- 验收：database 状态机单测覆盖幂等与节点匹配；core 人工节点用例断言批准后下一节点开始时状态为 `running`。

### 10.3 残留风险（不修）

- 定时流程中的 agent 节点内部写工具仍走 agent 自身的 HITL 确认（120s 超时默认拒绝），不会被 F2 的流程级无人值守门拦截；如需完全禁止，应单独立项把 trigger 语义传入协作运行时。
- 并行度仍无编辑器 UI 入口，本轮只保证字段不丢失。

## 11. 审批

已批准（2026-11-23）。F1–F5 已实施并通过 `pnpm check`、各包无缓存全量单测与 `pnpm verify:local`（8/8）。
