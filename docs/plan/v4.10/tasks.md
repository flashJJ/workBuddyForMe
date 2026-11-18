# v4.10 上下文可见：Tasks

> 依赖：[spec.md](./spec.md) 批准后执行。
> 约定：每完成一个任务批次即跑 `pnpm typecheck`、`pnpm check:lines`、`pnpm check:ascii`；手写 TS/TSX 单文件 ≤300 行（260 预警）。

## [x] T1 快照契约增量

- 修改 `packages/shared/src/schemas/chat/context-intelligence.ts`：
  - `sceneContextSnapshotPayloadSchema` 增加可选 `systemTokens` / `inputTokens` / `messageCount`。
- 修改 `packages/core/src/context/prompt-budget.ts`：
  - `fitPromptMessages` 在返回前计算三项并写入 `stats`。
- 修改 `packages/core/src/context/prompt-budget.test.ts`：
  - 未超预算、发生截断、空列表三种情况的不变量。
- 完成判据：定向单测通过；旧事件（缺字段）解析仍成功。

## [x] T2 时间线详情

- 修改 `packages/core/src/session-log/timeline.ts`：
  - `context_scene_snapshot` 详情在字段存在时追加 `system=` / `input=`。
- 修改 `packages/core/src/session-log/timeline.test.ts`：
  - 有新字段与缺字段两种断言。
- 完成判据：时间线测试通过；旧格式不变。

## [x] T3 共享汇总纯函数

- 新增 `apps/web/src/features/context-snapshots/scene-snapshot-events.ts`：
  - `SceneSnapshotEntry`、`SceneSnapshotSummary`、`parseSceneSnapshotEntries`、`summarizeSceneSnapshots`。
- 新增 `apps/web/src/features/context-snapshots/scene-snapshot-events.test.ts`。
- 新增 `apps/web/src/features/context-snapshots/index.ts` 公开入口。
- 完成判据：无效载荷跳过、角色取最新、limit、截断计数全部有测试。

## [x] T4 数据 hook

- 新增 `apps/web/src/features/context-snapshots/use-scene-snapshots.ts`：
  - 复用 `apiGet` / `API.events` / `QUERY_KEYS.events`；
  - 支持 `enabled` 与 `refetchInterval`。
- 完成判据：`pnpm typecheck` 通过；任务/Flow 调用签名一致。

## [x] T5 面板组件与 i18n

- 新增 `apps/web/src/features/context-snapshots/scene-snapshot-panel.tsx`。
- 新增 `apps/web/src/features/context-snapshots/scene-snapshot-panel.test.tsx`。
- 修改 `packages/shared/src/i18n/messages/context-insights.ts`：
  - zh/en 增加场景面板、角色、截断警告与建议文案。
- 完成判据：组件单测通过；空 summary 返回 null；`check:lines` 通过。

## [x] T6 协作接入

- 修改 `apps/web/src/features/agent-collab/agent-run-reducer.ts`：
  - `AgentCardState.contextSnapshots`；
  - `initAgentCard` 初始化；
  - `case 'context_scene_snapshot'` 追加并 `slice(-24)`。
- 修改 `apps/web/src/features/agent-collab/agent-run-reducer.test.ts`。
- 修改 `apps/web/src/features/agent-collab/agent-run-card.tsx`：
  - `BudgetBar` 后渲染紧凑面板。
- 完成判据：reducer 测试通过；快照帧不再被 `default` 丢弃。

## [x] T7 任务接入

- 修改 `apps/web/src/features/tasks/task-row.tsx`：
  - `expanded` 时调用 `useSceneSnapshots('task', task.id, { enabled: expanded })`；
  - 在 `TaskGovernanceSummary` 与 `TaskTimeline` 之间渲染面板。
- 完成判据：展开任务可见快照；查询失败不影响时间线。

## [x] T8 Flow 接入

- 修改 `packages/core/src/flow/run/flow-execution.ts`：
  - `recordContextSnapshot` 节流为「本 run 首条 + 所有截断」。
- 修改 `packages/core/src/flow/handlers/llm.ts`：
  - 每次装配后调用 `recordContextSnapshot`。
- 修改 `packages/core/src/flow/handlers/llm.test.ts`。
- 修改 `apps/web/src/features/flow-execution/execution-panel.tsx`：
  - 运行中 5 秒轮询 flow 快照，终态停止；
  - 时间线上方渲染紧凑面板。
- 完成判据：正常运行有 1 条基线；截断追加；非 LLM 节点不写；终态停止轮询。

## [x] T9 门禁与真机验收

- 运行：
  - `pnpm typecheck`
  - `pnpm check:lines`
  - `pnpm check:ascii`
  - `pnpm --filter @wbfm/core test -- src/context/prompt-budget.test.ts`
  - `pnpm --filter @wbfm/core test -- src/session-log/timeline.test.ts`
  - `pnpm --filter @wbfm/core test -- src/flow/handlers/llm.test.ts`
  - `pnpm --filter @wbfm/web test -- src/features/context-snapshots`
  - `pnpm --filter @wbfm/web test -- src/features/agent-collab/agent-run-reducer.test.ts`
  - `pnpm eval:agent`
- 真机记录写入 [00-context-observability-plan.md](./00-context-observability-plan.md) 的实施记录（§9–§10）。
- 完成判据：门禁全绿；协作/任务/Flow 三处面板可见且数值与 `/api/events` 一致。

> 验收结果：typecheck / check:lines / check:ascii / i18n parity / `eval:agent` 15/15 全部通过；任务与 Flow 面板经浏览器展开验证，协作快照字段经真实 mock run 事件核对。详见计划 §10。
