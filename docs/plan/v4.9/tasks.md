# v4.9 统一上下文控制器：Tasks

> 依赖：[spec.md](./spec.md) 批准后执行。
> 约定：每完成一个任务批次即跑 `pnpm typecheck`、`pnpm check:lines`、`pnpm check:ascii`；手写 TS/TSX 单文件 ≤300 行（260 预警）。

## [x] T1 契约与场景策略

- 新增 `packages/shared/src/constants/context-scenes.ts`：
  - `CONTEXT_SCENES`、`ContextScene`、`CONTEXT_BUDGET_KINDS`、`ContextBudgetPreset`、`CONTEXT_BUDGET_PRESETS`、`resolveClampedBudget`。
- 修改 `packages/shared/src/constants/index.ts` 增加导出。
- 修改 `packages/shared/src/schemas/chat/context-intelligence.ts`：
  - `CONTEXT_SCENE_ROLES`、`sceneContextSnapshotPayloadSchema`、`SceneContextSnapshotPayload`。
- 新增 `packages/core/src/context/scene-policy.test.ts`：覆盖 4096/32768/1000/null/1M 五档预算数值。
- 完成判据：`pnpm --filter @wbfm/shared typecheck` 通过；预算数值单测通过。

## [x] T2 提示词装配纯函数

- 新增 `packages/core/src/context/prompt-budget.ts`：
  - `fitPromptMessages`、头尾截断、丢弃策略、`FitPromptOptions`、`FitPromptResult`。
- 新增 `packages/core/src/context/prompt-budget.test.ts`：
  - 未超预算逐字不变；超预算头尾保留；末条保留；system 可截断；图片计数；`promptTokens ≤ budgetTokens`。
- 新增 `packages/core/src/context/index.ts` 导出。
- 修改 `packages/core/package.json` 增加 `"./context"` 导出。
- 完成判据：定向单测通过；新文件 ≤300 行。

## [x] T3 快照写入与时间线

- 新增 `packages/core/src/context/snapshot.ts`：`CONTEXT_SCENE_SNAPSHOT_EVENT`、`recordSceneSnapshot`。
- 修改 `packages/core/src/session-log/timeline.ts`：`context_scene_snapshot` 标签与详情。
- 修改 `packages/core/src/session-log/timeline.test.ts`（如存在）补充断言。
- 完成判据：事件写入 task/flow/agent scope 的测试通过；时间线标签正确。

## [x] T4 预算收口

- 修改 `packages/core/src/agents/context/task-context.ts`：`resolveTaskContextBudget` 委托 `resolveClampedBudget(_, 'contextBlock')`。
- 修改 `packages/core/src/agent/step-condenser.ts`：`resolveStepHistoryBudget` 委托 `resolveClampedBudget(_, 'stepHistory')`。
- 更新对应测试，保持原有数值断言。
- 完成判据：`task-context`、`step-condenser` 单测通过；无行为差异。

## [x] T5 协作角色客户端接入

- 修改 `packages/core/src/agents/clients/llm-agent-clients.ts`：
  - Planner scene `collab_plan`、Reviewer scene `collab_review`；
  - 发请求前 `fitPromptMessages`；
  - 返回值附 `contextStats`。
- 修改 `packages/core/src/agents/runner/runner-types.ts`：三个客户端返回类型增加可选 `contextStats`。
- 修改 `packages/core/src/agents/protocol/executor-adapter.ts`：收集 Executor 决策器最坏一次 `contextStats` 并返回。
- 修改 `packages/core/src/agent/llm-planner.ts`：
  - `createLlmPlanner` 增加 `scene`、`onContextStats`；
  - 每次决策调用 `fitPromptMessages`，每次调用回调 `onContextStats`。
- 修改测试：`llm-agent-clients.test.ts`、`llm-planner.test.ts`、`executor-adapter.test.ts`。
- 完成判据：三角色返回值含正确 scene；超长 prompt 被截断；短 prompt 逐字不变。

## [x] T6 协作 runner 事件与上下文块窗口

- 修改 `packages/core/src/agents/runner/agent-runner.ts`：
  - `AgentRunEvent` 增加 `context_scene_snapshot`；
  - Planner/Executor/Reviewer 调用后各 yield 一条，payload 含 `runId`、`role` 与快照字段。
- 修改 `apps/web/src/lib/server/agent-clients-provider.ts`：
  - Executor 决策器传 `scene: 'collab_exec'`；
  - 上下文块窗口取 Planner/Executor/Reviewer 三个模型窗口最小值。
- 更新 `agent-runner.test.ts`、`agent-run-client` 相关 mock。
- 完成判据：协作单测通过；4096 模型下 Planner prompt 不超过预算。

## [x] T7 桌面任务决策器接入

- 修改 `apps/web/src/lib/server/task-launcher.ts`：
  - `resolveTaskLaunchArtifacts` 改为异步；
  - 构造最小 `ServiceDeps` 子集（db/cipher/events/workPlans）；
  - `buildTaskContextBlock` 装配会话上下文，失败降级 undefined；
  - `createLlmPlanner` 传 `scene:'task_step'` 与快照回调（首次 + 截断补写）。
- 修改 `packages/core/src/scheduler/scheduled-agent-runner.ts`：`launch` 支持 Promise 并 `await`。
- 修改 `apps/web/src/lib/server/scheduled-agent.ts`：适配异步 launch。
- 新增/更新 `task-launcher.test.ts`。
- 完成判据：有会话时返回 contextBlock；无会话不报错；快照写入 task scope。

## [x] T8 桌面任务启动与任务循环透传

- 修改 `packages/core/src/services/task/task-runner-service.ts`：`TaskStartParams` 增加 `contextBlock?`，透传 `runTaskLoop`。
- 修改 `apps/web/src/app/api/tasks/[id]/events/route.ts`：`await resolveTaskLaunchArtifacts`，把 `contextBlock` 传给 `taskRunner.start`。
- 更新 `apps/web/src/app/api/tasks/tasks.test.ts`。
- 完成判据：任务启动成功；决策提示词含【会话上下文】；无上下文路径行为不变。

## [x] T9 Flow LLM 节点接入

- 修改 `packages/core/src/flow/graph/types.ts`：`FlowExecutionContext` 增加 `recordContextSnapshot?`。
- 修改 `packages/core/src/flow/run/flow-execution.ts`：注入写入 flow scope 的回调。
- 修改 `packages/core/src/flow/handlers/llm.ts`：装配后 `fitPromptMessages`，仅截断时写快照。
- 新增 `packages/core/src/flow/handlers/llm.test.ts`。
- 完成判据：长输入截断且节点成功；短输入不写快照、输出不变。

## [x] T10 评测与门禁

- 修改 `scripts/eval/eval-agent.mjs`：正向运行后读取 `GET /api/events?scope=agent&scopeId=<runId>`，断言：
  - 存在 `context_scene_snapshot`；
  - 角色覆盖 planner/executor（视运行阶段）；
  - 每条 `promptTokens <= budgetTokens`；
  - `usableWindow <= contextWindow`。
- 运行：
  - `pnpm typecheck`
  - `pnpm check:lines`
  - `pnpm check:ascii`
  - `pnpm --filter @wbfm/core test -- src/context/prompt-budget.test.ts`
  - `pnpm --filter @wbfm/core test -- src/agent/llm-planner.test.ts`
  - `pnpm --filter @wbfm/core test -- src/agents`
  - `pnpm --filter @wbfm/core test -- src/flow/handlers/llm.test.ts`
  - `pnpm --filter @wbfm/web test -- task-launcher`
  - `pnpm eval:agent`
- 完成判据：全部门禁退出 0；eval 通过。

## [x] T11 真机验收

- 4096 + qwen2.5:7b 协作：无上游 400；快照预算符合 spec §5.3。
- 1M 大窗口协作：三角色 `truncated=false`，行为与 v4.8 一致。
- 从对话发起桌面任务：启动快照存在，提示词含【会话上下文】。
- Flow 长文本节点：节点成功，快照 `truncated=true`。
- 完成判据：结果写入 `00-context-controller-plan.md#10-实施记录`。

## [x] T12 文档与提交

- 更新 `00-context-controller-plan.md` §10 实施记录（里程碑状态、落点、已知边界）。
- 更新 `spec.md` 状态为「已实现」。
- 提交信息：`feat(v4.9): 统一上下文控制器与场景预算/快照`。
- 提交内容：代码、测试、评测脚本、v4.9 文档。
- 完成判据：`git status` 干净；提交仅含 v4.9 相关文件。
