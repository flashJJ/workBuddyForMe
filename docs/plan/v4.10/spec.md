# v4.10 上下文可见：Spec

> 状态：已实现（M0–M5）
> 上游：[00-context-observability-plan.md](./00-context-observability-plan.md)
> 范围：只做「快照解释 + 跨场景展示」；不改提示词内容、预算公式、截断算法与数据库 schema。

## 1. 范围与前置

### 1.1 前置

- v4.9 已交付 `context_scene_snapshot` 事件，协作/任务/Flow 均已写入 `session_events`。
- v4.8 已有对话侧 `context-insights-panel` 与 `/api/events` 读取模式，可直接复用。
- `sceneContextSnapshotPayloadSchema` 已通过 `SessionLogService.record` 落库，载荷上限 200KB。

### 1.2 本版要解决的问题

| 问题 | 本版动作 |
|---|---|
| 非对话域预算不可见 | 协作卡、任务详情、Flow 执行面板各加「上下文预算」区 |
| 快照只有总量 | 契约增量补充 system/input/messageCount |
| 协作快照帧被丢弃 | reducer 保存快照并限制 24 条 |
| Flow 正常节点无基线 | 写入策略改为「首节点 + 截断」 |
| 截断只有一行文本 | 面板给出警告与建议 |

## 2. 契约

### 2.1 场景快照增量

文件：`packages/shared/src/schemas/chat/context-intelligence.ts`

```ts
export const sceneContextSnapshotPayloadSchema = z.object({
  scene: z.enum(CONTEXT_SCENES),
  role: z.enum(CONTEXT_SCENE_ROLES).optional(),
  contextWindow: z.number().int().positive(),
  usableWindow: z.number().int().nonnegative(),
  reserveTokens: z.number().int().nonnegative(),
  budgetTokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  /** v4.10：system 消息占用；旧事件缺省 */
  systemTokens: z.number().int().nonnegative().optional(),
  /** v4.10：非 system 消息占用；旧事件缺省 */
  inputTokens: z.number().int().nonnegative().optional(),
  /** v4.10：最终消息条数；旧事件缺省 */
  messageCount: z.number().int().nonnegative().optional(),
  truncatedMessages: z.number().int().nonnegative(),
  droppedMessages: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
```

不变量（新事件必须满足）：

- `systemTokens + inputTokens === promptTokens`
- `messageCount === fitPromptMessages 返回的 messages.length`
- 三个字段只在 `fitPromptMessages` 产出的事件中出现；`buildSceneSnapshot`（任务启动块）不填。

### 2.2 前端汇总类型

文件：`apps/web/src/features/context-snapshots/scene-snapshot-events.ts`（新增）

```ts
export interface SceneSnapshotEntry {
  value: SceneContextSnapshotPayload;
  /** 来自 /api/events 的 createdAt；SSE 来源可缺省 */
  at?: string;
  id?: string;
}

export interface SceneSnapshotSummary {
  /** 最近 N 条，保持输入顺序 */
  entries: SceneSnapshotEntry[];
  /** planner → executor → reviewer 各自最新一条；无角色场景为空 */
  latestByRole: Array<{ role: ContextSceneRole; entry: SceneSnapshotEntry }>;
  /** 最近一条（不分角色） */
  latest: SceneSnapshotEntry | null;
  /** entries 中 truncated=true 的条数 */
  truncatedCount: number;
  hasTruncated: boolean;
}

export function parseSceneSnapshotEntries(
  items: ReadonlyArray<{ id: string; at: string; type: string; payload: unknown }>,
): SceneSnapshotEntry[];

export function summarizeSceneSnapshots(
  entries: readonly SceneSnapshotEntry[],
  limit?: number, // 默认 20
): SceneSnapshotSummary;
```

解析规则：

- `type !== 'context_scene_snapshot'` 跳过。
- `sceneContextSnapshotPayloadSchema.safeParse(payload)` 失败跳过，不抛错。
- 结果保持输入顺序（`/api/events` 已按 seq 升序）。
- `summarize` 只取最后 `limit` 条参与汇总。

### 2.3 数据 hook

文件：`apps/web/src/features/context-snapshots/use-scene-snapshots.ts`（新增）

```ts
export function useSceneSnapshots(
  scope: 'task' | 'flow' | 'agent',
  scopeId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false },
): {
  summary: SceneSnapshotSummary;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
```

- 复用 `apiGet`、`API.events(scope, scopeId)`、`QUERY_KEYS.events(scope, scopeId)`。
- `enabled` 缺省为 `Boolean(scopeId) && (options?.enabled ?? true)`。
- `staleTime: 5_000`；`refetchInterval` 原样透传。
- 响应类型 `{ items: Array<{ id: string; at: string; type: string; payload: unknown }> }`。

### 2.4 视图组件

文件：`apps/web/src/features/context-snapshots/scene-snapshot-panel.tsx`（新增）

```ts
export function SceneSnapshotPanel(props: {
  summary: SceneSnapshotSummary;
  /** 协作卡/Flow 使用，减少纵向占位 */
  compact?: boolean;
  /** 缺省折叠；有截断时强制展开 */
  defaultOpen?: boolean;
}): React.ReactElement | null;
```

渲染规则：

- `summary.entries.length === 0` 返回 `null`。
- 标题「上下文预算」+ 快照总数 + 截断徽标（`truncatedCount > 0`）。
- 有角色：按 planner → executor → reviewer 渲染最新行；同一场景多角色时每行显示角色名。
- 无角色：按 scene 取最新一条，`task_start` 显示「启动上下文块」。
- 每行内容：`used = promptTokens`、`budget = budgetTokens`、进度条、`window`、`reserve`；存在 `systemTokens` 时追加 `system/input` 两个数值。
- 截断行显示：丢弃消息数、被截断消息数，以及建议文案。
- 建议文案只做提示，不提供自动跳转或改配置按钮。
- 测试标识：`data-testid="scene-snapshot-panel"`；行 `data-testid="scene-snapshot-<scene>[-<role>]"`。

## 3. 逐文件改动

| 文件 | 类型 | 改动 |
|---|---|---|
| `packages/shared/src/schemas/chat/context-intelligence.ts` | 修改 | `sceneContextSnapshotPayloadSchema` 增加三个可选字段 |
| `packages/core/src/context/prompt-budget.ts` | 修改 | `fitPromptMessages` 计算 `systemTokens` / `inputTokens` / `messageCount` |
| `packages/core/src/session-log/timeline.ts` | 修改 | `context_scene_snapshot` 详情追加 system/input（存在时） |
| `packages/shared/src/i18n/messages/context-insights.ts` | 修改 | zh/en 增加场景面板文案 |
| `apps/web/src/features/context-snapshots/index.ts` | 新增 | 公开入口：组件、hook、汇总函数与类型 |
| `apps/web/src/features/context-snapshots/scene-snapshot-events.ts` | 新增 | 解析、汇总纯函数 |
| `apps/web/src/features/context-snapshots/scene-snapshot-events.test.ts` | 新增 | 解析/角色最新/上限/截断计数 |
| `apps/web/src/features/context-snapshots/use-scene-snapshots.ts` | 新增 | `/api/events` 查询 hook |
| `apps/web/src/features/context-snapshots/scene-snapshot-panel.tsx` | 新增 | 预算面板组件 |
| `apps/web/src/features/context-snapshots/scene-snapshot-panel.test.tsx` | 新增 | 角色行、截断警告、空态不渲染 |
| `apps/web/src/features/agent-collab/agent-run-reducer.ts` | 修改 | `AgentCardState.contextSnapshots`；处理快照帧；上限 24 |
| `apps/web/src/features/agent-collab/agent-run-reducer.test.ts` | 修改 | 快照追加、上限、初始值 |
| `apps/web/src/features/agent-collab/agent-run-card.tsx` | 修改 | 在 `BudgetBar` 后渲染紧凑面板 |
| `apps/web/src/features/tasks/task-row.tsx` | 修改 | 展开时调用 hook 并渲染面板 |
| `apps/web/src/features/flow-execution/execution-panel.tsx` | 修改 | 运行中轮询 flow 快照并渲染紧凑面板 |
| `packages/core/src/flow/run/flow-execution.ts` | 修改 | `recordContextSnapshot` 节流为「首条 + 截断」 |
| `packages/core/src/flow/handlers/llm.ts` | 修改 | 每次装配后调用 `recordContextSnapshot`（sink 决定落库） |
| `packages/core/src/flow/handlers/llm.test.ts` | 修改 | 断言每次装配回调 stats；未配置回调不报错 |
| `packages/core/src/context/prompt-budget.test.ts` | 修改 | 三个新字段与不变量 |
| `packages/core/src/session-log/timeline.test.ts` | 修改 | 详情包含 system/input |

## 4. 行为规范

### 4.1 统计字段

```text
systemTokens = Σ estimateMessageTokens(m) for m.role === 'system'
inputTokens  = promptTokens - systemTokens
messageCount = messages.length
```

- 在丢弃与截断全部完成后计算，反映最终实际下发内容。
- 空消息列表：三项均为 0。
- 不改变 `promptTokens` 的既有含义（估算总量）。

### 4.2 协作 reducer

```ts
case 'context_scene_snapshot':
  return {
    ...state,
    contextSnapshots: [...state.contextSnapshots, frame.data].slice(-24),
  };
```

- `frame.data` 为 `SceneContextSnapshotPayload & { runId: string }`，可直接赋给 `SceneContextSnapshotPayload[]`。
- 其他帧不修改该字段。
- `initAgentCard`、`mergeRunView`、`cardFromRun` 不清理已收集快照。

### 4.3 任务面板

- `TaskRow` 仅在 `expanded === true` 时启用查询。
- 查询失败显示错误文案，不隐藏步骤时间线。
- 面板位置：`TaskGovernanceSummary` 之后、`TaskTimeline` 之前。

### 4.4 Flow 写入策略

`flow-execution.ts` 在 `execute()` 作用域内维护 `let hasBaselineSnapshot = false`：

```ts
recordContextSnapshot: (payload) => {
  if (hasBaselineSnapshot && !payload.truncated) return;
  hasBaselineSnapshot = true;
  deps.events?.record({ scope: 'flow', scopeId: runId, type: 'context_scene_snapshot', payload });
}
```

- `llm.ts` 每次装配后都调用 `ctx.recordContextSnapshot?.(stats)`。
- 第一个 LLM 节点无论是否截断都写一条；后续只有 `truncated=true` 才写。
- 非 LLM 节点不产生快照。
- 节流状态属于单次 run，run 结束即释放。

### 4.5 Flow 面板轮询

- `ExecutionPanel` 调用 `useSceneSnapshots('flow', runId, { refetchInterval: terminal ? false : 5_000 })`。
- 面板放在 `ExecutionTimeline` 上方；`summary.entries` 为空时不渲染。
- 终态后停止轮询，用户仍可手动刷新。

## 5. 测试与验证

### 5.1 单测

| 文件 | 断言 |
|---|---|
| `packages/core/src/context/prompt-budget.test.ts` | 未超预算与截断后均满足 `systemTokens + inputTokens = promptTokens`；`messageCount` 等于最终条数；空列表全 0 |
| `packages/core/src/session-log/timeline.test.ts` | 新字段存在时详情含 `system=` / `input=`；缺失时保持旧格式 |
| `packages/core/src/flow/handlers/llm.test.ts` | 每次装配调用一次回调；未配置回调不抛错 |
| `apps/web/src/features/context-snapshots/scene-snapshot-events.test.ts` | 无效载荷跳过；角色取最新；limit 生效；截断计数正确 |
| `apps/web/src/features/context-snapshots/scene-snapshot-panel.test.tsx` | 三角色行；截断警告；空 summary 返回 null |
| `apps/web/src/features/agent-collab/agent-run-reducer.test.ts` | 快照帧追加；超过 24 条保留最近；初始为空 |

### 5.2 定向命令

```bash
pnpm typecheck
pnpm check:lines
pnpm check:ascii
pnpm --filter @wbfm/core test -- src/context/prompt-budget.test.ts
pnpm --filter @wbfm/core test -- src/session-log/timeline.test.ts
pnpm --filter @wbfm/core test -- src/flow/handlers/llm.test.ts
pnpm --filter @wbfm/web test -- src/features/context-snapshots
pnpm --filter @wbfm/web test -- src/features/agent-collab/agent-run-reducer.test.ts
pnpm eval:agent
```

### 5.3 真机

| 场景 | 断言 |
|---|---|
| 4096 qwen 协作 | 卡片出现三角色行，`budgetTokens=3008`，无「未记录」；截断时出现警告 |
| 桌面任务 | 展开可见 `task_start` 与 `task_step`；无会话任务不报错 |
| Flow 长文本节点 | 面板至少 1 条基线；截断节点追加一条暖色行 |
| 旧事件回放 | 手工构造缺新字段的 payload，面板正常显示总量 |

## 6. 非目标与回滚

- 不做记忆治理、A/B 重放、独立上下文中心、对话面板重构。
- 无数据库迁移；新字段可选。
- 回滚只需回退代码；Flow 事件恢复为仅截断写入，旧事件仍可读。
