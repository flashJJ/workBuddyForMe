# v4.9 统一上下文控制器：Spec

> 状态：已实现（M0–M5，含离线评测与真机验收）
> 上游：[00-context-controller-plan.md](./00-context-controller-plan.md)
> 范围：只做「场景策略 + 预算 + 快照」三层公共件与三域接入；不重写对话侧上下文策略。

## 1. 范围与前置

### 1.1 前置

- v4.8 已交付 `ContextPlan`、意图配额、压缩事件、`context_snapshot` 与上下文面板。
- v4.7 已交付任务上下文块、步骤历史 Condenser、计划检查点与续跑。
- `session_events` 已支持 `chat/task/flow/agent/meeting/branch` scope，本版不新增表、不做迁移。

### 1.2 本版要解决的问题

| 问题 | 本版动作 |
|---|---|
| 任务上下文与步骤历史各自维护预算公式 | 收敛为 `resolveClampedBudget` 单一公式 |
| 协作/任务/Flow 单次提示词无总预算 | 新增 `fitPromptMessages`，超窗时头尾保留截断 |
| 协作上下文块按 Executor 窗口装配，Planner 可能更小 | 取三角色模型窗口最小值 |
| 桌面任务不注入会话上下文 | 启动时装配 `contextBlock` 并透传 |
| 非对话域没有上下文快照 | 新增 `context_scene_snapshot` 事件 |

## 2. 契约

### 2.1 场景与预算预设

文件：`packages/shared/src/constants/context-scenes.ts`（新增）

```ts
export const CONTEXT_SCENES = [
  'chat_turn',
  'collab_plan',
  'collab_exec',
  'collab_review',
  'task_start',
  'task_step',
  'flow_node',
] as const;
export type ContextScene = (typeof CONTEXT_SCENES)[number];

export const CONTEXT_BUDGET_KINDS = ['contextBlock', 'stepHistory'] as const;
export type ContextBudgetKind = (typeof CONTEXT_BUDGET_KINDS)[number];

export interface ContextBudgetPreset {
  windowRatio: number;
  minTokens: number;
  maxTokens: number;
}

export const CONTEXT_BUDGET_PRESETS: Record<ContextBudgetKind, ContextBudgetPreset> = {
  contextBlock: { windowRatio: 0.15, minTokens: 320, maxTokens: 2000 },
  stepHistory: { windowRatio: 0.12, minTokens: 320, maxTokens: 1200 },
};

export function resolveClampedBudget(
  contextWindow: number | null | undefined,
  kind: ContextBudgetKind,
): number;
```

语义：

- 窗口未知（`null` / `undefined` / `<= 0`）返回 `maxTokens`。
- 否则 `max(minTokens, min(maxTokens, floor(contextWindow × windowRatio)))`。
- 必须与现有实现逐项一致：4096 → contextBlock 614 / stepHistory 491；32768 → 2000 / 1200；1000 → 320 / 320；null → 2000 / 1200。

### 2.2 场景快照事件

文件：`packages/shared/src/schemas/chat/context-intelligence.ts`（扩展）

```ts
import { CONTEXT_SCENES } from '../../constants/context-scenes';

export const CONTEXT_SCENE_ROLES = ['planner', 'executor', 'reviewer'] as const;

export const sceneContextSnapshotPayloadSchema = z.object({
  scene: z.enum(CONTEXT_SCENES),
  role: z.enum(CONTEXT_SCENE_ROLES).optional(),
  contextWindow: z.number().int().positive(),
  usableWindow: z.number().int().nonnegative(),
  reserveTokens: z.number().int().nonnegative(),
  budgetTokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  truncatedMessages: z.number().int().nonnegative(),
  droppedMessages: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type SceneContextSnapshotPayload = z.infer<typeof sceneContextSnapshotPayloadSchema>;
```

事件：`type = 'context_scene_snapshot'`，scope 与 scopeId：

| 域 | scope | scopeId |
|---|---|---|
| 协作 | `agent` | `agentRunId` |
| 桌面任务 | `task` | `taskRunId` |
| Flow | `flow` | `flowRunId` |

写入复用 `SessionLogService.record`（best-effort，失败不影响主请求）。保留策略沿用 180 天。

### 2.3 提示词装配结果

文件：`packages/core/src/context/prompt-budget.ts`（新增）

```ts
export interface FitPromptOptions {
  contextWindow: number;
  scene: ContextScene;
  role?: 'planner' | 'executor' | 'reviewer';
  reserveTokens?: number;
}

export interface FitPromptResult {
  messages: ChatMessage[];
  stats: SceneContextSnapshotPayload;
}

export function fitPromptMessages(
  messages: ChatMessage[],
  options: FitPromptOptions,
): FitPromptResult;
```

## 3. 逐文件改动

| 文件 | 类型 | 改动 |
|---|---|---|
| `packages/shared/src/constants/context-scenes.ts` | 新增 | 场景枚举、预算预设、`resolveClampedBudget` |
| `packages/shared/src/constants/index.ts` | 修改 | 增加 `export * from './context-scenes';` |
| `packages/shared/src/schemas/chat/context-intelligence.ts` | 修改 | 增加 `CONTEXT_SCENE_ROLES`、`sceneContextSnapshotPayloadSchema` 与类型 |
| `packages/core/src/context/index.ts` | 新增 | 导出 `prompt-budget`、`snapshot` |
| `packages/core/src/context/prompt-budget.ts` | 新增 | `fitPromptMessages`、头尾截断、统计 |
| `packages/core/src/context/snapshot.ts` | 新增 | `CONTEXT_SCENE_SNAPSHOT_EVENT`、`recordSceneSnapshot` |
| `packages/core/src/context/prompt-budget.test.ts` | 新增 | 预算、截断、末条保留、图片计数 |
| `packages/core/src/context/scene-policy.test.ts` | 新增 | `resolveClampedBudget` 五档数值 |
| `packages/core/package.json` | 修改 | `exports` 增加 `"./context"`（指向 `./src/context/index.ts`） |
| `packages/core/src/agents/context/task-context.ts` | 修改 | `resolveTaskContextBudget` 委托 `resolveClampedBudget(_, 'contextBlock')` |
| `packages/core/src/agent/step-condenser.ts` | 修改 | `resolveStepHistoryBudget` 委托 `resolveClampedBudget(_, 'stepHistory')` |
| `packages/core/src/agent/llm-planner.ts` | 修改 | `createLlmPlanner` 增加 `scene` / `onContextStats`；每次决策调用 `fitPromptMessages` |
| `packages/core/src/agents/clients/llm-agent-clients.ts` | 修改 | Planner/Reviewer 调用 `fitPromptMessages`，返回值附 `contextStats` |
| `packages/core/src/agents/runner/runner-types.ts` | 修改 | 三个客户端返回类型增加可选 `contextStats` |
| `packages/core/src/agents/protocol/executor-adapter.ts` | 修改 | 收集决策器最坏一次 `contextStats` 并返回 |
| `packages/core/src/agents/runner/agent-runner.ts` | 修改 | 每角色调用后 yield `context_scene_snapshot`；事件联合类型增加该事件 |
| `apps/web/src/lib/server/agent-clients-provider.ts` | 修改 | Executor 决策器传 `scene:'collab_exec'`；上下文块窗口取三角色最小值 |
| `apps/web/src/lib/server/task-launcher.ts` | 修改 | 改为异步；装配会话上下文块；任务决策器传 `scene:'task_step'` 与快照回调 |
| `packages/core/src/scheduler/scheduled-agent-runner.ts` | 修改 | `launch` 类型放宽为 `TaskLaunchArtifacts \| Promise<TaskLaunchArtifacts>` 并 `await` |
| `apps/web/src/app/api/tasks/[id]/events/route.ts` | 修改 | `await resolveTaskLaunchArtifacts`；把 `contextBlock` 传给 `taskRunner.start` |
| `packages/core/src/services/task/task-runner-service.ts` | 修改 | `TaskStartParams` 增加 `contextBlock?`；透传 `runTaskLoop` |
| `packages/core/src/flow/graph/types.ts` | 修改 | `FlowExecutionContext` 增加 `recordContextSnapshot?` |
| `packages/core/src/flow/run/flow-execution.ts` | 修改 | 注入 `recordContextSnapshot`（scope `flow`，scopeId `runId`） |
| `packages/core/src/flow/handlers/llm.ts` | 修改 | 装配后 `fitPromptMessages`；仅截断时写快照 |
| `packages/core/src/session-log/timeline.ts` | 修改 | 增加 `context_scene_snapshot` 标签与详情 |
| `scripts/eval/eval-agent.mjs` | 修改 | 正向运行后断言 agent scope 快照数量、角色、预算不变量 |
| 相关测试 | 修改/新增 | `task-context.test.ts`、`step-condenser.test.ts`、`llm-planner.test.ts`、`llm-agent-clients.test.ts`、`agent-runner.test.ts`、`packages/core/src/flow/handlers/llm.test.ts`（新增）、`apps/web/src/lib/server/task-launcher.test.ts`（如不存在则新增） |

## 4. 行为规范

### 4.1 预算计算

```text
usableWindow = floor(contextWindow × 0.9)
reserveTokens = options.reserveTokens ?? resolveReserveTokens(null, contextWindow)
budgetTokens = max(64, usableWindow − reserveTokens − 64)
promptTokens = Σ estimateMessageTokens(message)
```

- `contextWindow` 必须为正；调用方从 `target.model.contextWindow` 传入。
- `reserveTokens` 复用对话侧 v4.8.1 的窗口比例化（15%，512–2048）。
- 结果写入 `stats`，`promptTokens` 为估算值，不读模型真实 usage。

### 4.2 截断算法（确定性）

1. 若 `promptTokens <= budgetTokens`：原样返回，`truncated=false`、`truncatedMessages=0`、`droppedMessages=0`。
2. 从最旧开始丢弃非 system、非末条消息，直到总量回到预算内或只剩末条。
3. 若仍超限：取当前最大的非 system 消息，保留头 60% / 尾 40%，中间插入 `\n…（上下文已截断）…\n`；只截断文本片段，图片计数保留。
4. 若仍超限：从尾部截断系统提示词，直到总量回到预算内。
5. 若消息结构开销本身已超预算：把末条消息截断到 `max(16, budgetTokens − 其他消息开销)`；末条永不丢弃。
6. `truncatedMessages` 记录内容被改写的消息数；`droppedMessages` 记录被丢弃的消息数；`truncated = truncatedMessages > 0 || droppedMessages > 0`。

不变量（单测必须覆盖）：

- 所有非末条消息在预算充足时逐字不变。
- 末条消息始终存在。
- 截断后 `estimateTokens` 总和 ≤ `budgetTokens`（允许实现为结构开销预留 ≤ 16 tokens 的误差）。
- 头尾片段必须存在：结果包含原消息的前 10 个字符与后 10 个字符（原消息长度足够时）。

### 4.3 各域接入规则

| 域 | 装配点 | 场景 | 快照规则 |
|---|---|---|---|
| 协作 Planner | `createLlmPlannerClient` | `collab_plan` | 每次调用一条 |
| 协作 Reviewer | `createLlmReviewerClient` | `collab_review` | 每次调用一条 |
| 协作 Executor | `createLlmPlanner` + `executor-adapter` | `collab_exec` | 每轮 Executor 结束时取最坏一次（`promptTokens` 最大）写一条 |
| 桌面任务 | `createLlmPlanner` | `task_step` | 首次决策一条；之后仅 `truncated` 由 false 变 true 时补写 |
| 桌面任务启动 | `resolveTaskLaunchArtifacts` | `task_start` | 启动时一条，`promptTokens` 为上下文块估算值 |
| Flow LLM 节点 | `llmNodeHandler` | `flow_node` | 仅 `truncated=true` 时一条 |

### 4.4 协作上下文块窗口

`createAgentTaskContextResolver` 不再只取 Executor 窗口，改为：

```ts
const windows = (['planner', 'executor', 'reviewer'] as const)
  .map((role) => {
    try {
      return resolveChatTargetForModelId(
        { db, cipher },
        assistant?.[ROLE_FIELD[role]] ?? assistant?.modelId ?? null,
      ).model.contextWindow;
    } catch {
      return null;
    }
  })
  .filter((n): n is number => typeof n === 'number' && n > 0);
const contextWindow = windows.length > 0 ? Math.min(...windows) : null;
```

- 任一角色模型未配置时不阻断，按其余角色最小值装配。
- 全部失败时传 `null`，沿用上限 2000。

### 4.5 桌面任务启动

`resolveTaskLaunchArtifacts` 的新签名：

```ts
export async function resolveTaskLaunchArtifacts(
  services: ServiceContainer,
  run: TaskRunView,
): Promise<TaskLaunchArtifacts>;

export interface TaskLaunchArtifacts {
  planner: TaskPlanner;
  allowedTools: string[];
  visionCapable: boolean;
  contextBlock?: string;
}
```

实现要点：

- 构造最小 `ServiceDeps` 子集：`{ db: services.db, cipher: services.cipher, events: services.sessionLog, workPlans: services.workPlans }`，用于 `buildTaskContextBlock` 与快照写入。
- `buildTaskContextBlock` 失败（抛错）时捕获，`contextBlock` 省略，不阻断任务。
- 决策器回调写入 `task` scope；首条 + 截断补写。
- 路由与定时任务都必须 `await` 该函数。

### 4.6 Flow LLM 节点

- `llmNodeHandler` 在拿到 `resolveChatTarget` 后，用 `model.contextWindow` 调用 `fitPromptMessages`。
- 截断时调用 `ctx.recordContextSnapshot?.(stats)`；未截断不写事件。
- 未配置 `recordContextSnapshot` 时（引擎测试）只截断、不写事件。

### 4.7 时间线

`projectTimeline` 增加：

- `case 'context_scene_snapshot'`：标签 `上下文快照：<scene>`；
- 详情：`budget=<budgetTokens>, prompt=<promptTokens>, truncated=<true|false>`。

## 5. 测试与验证

### 5.1 单测

| 文件 | 断言 |
|---|---|
| `packages/core/src/context/prompt-budget.test.ts` | 未超预算逐字不变；超预算头尾保留；末条保留；system 可截断；图片计数；`promptTokens ≤ budgetTokens` |
| `packages/core/src/context/scene-policy.test.ts` | 4096/32768/1M/1000/null 五档预算数值 |
| `packages/core/src/agents/context/task-context.test.ts` | 现有 4096/32768/1M/1000/null 断言保持通过 |
| `packages/core/src/agent/step-condenser.test.ts` | 现有预算断言保持通过 |
| `packages/core/src/agent/llm-planner.test.ts` | 超长 prompt 被截断；`onContextStats` 每次调用触发；未超预算消息不变 |
| `packages/core/src/agents/clients/llm-agent-clients.test.ts` | Planner/Reviewer 返回 `contextStats`；scene 正确；超窗时截断 |
| `packages/core/src/agents/runner/agent-runner.test.ts` | 三角色各 yield 一条 `context_scene_snapshot`；payload 含 runId/role |
| `packages/core/src/flow/handlers/llm.test.ts` | 长输入截断并写快照；短输入不写快照 |
| `apps/web/src/lib/server/task-launcher.test.ts` | 异步返回 contextBlock；无会话时为 undefined；快照回调写 task scope |

### 5.2 命令

```text
pnpm typecheck
pnpm check:lines
pnpm check:ascii
pnpm --filter @wbfm/core test -- src/context/prompt-budget.test.ts
pnpm --filter @wbfm/core test -- src/agent/llm-planner.test.ts
pnpm --filter @wbfm/core test -- src/agents
pnpm --filter @wbfm/core test -- src/flow/handlers/llm.test.ts
pnpm --filter @wbfm/web test -- task-launcher
pnpm eval:agent
```

### 5.3 真机验收

| 场景 | 通过标准 |
|---|---|
| 4096 + qwen2.5:7b 协作 | 三角色无上游 400；快照 `usableWindow=3686`、`reserveTokens=614`、`budgetTokens=3008`；上下文块 ≤ 614 |
| 1M 大窗口协作 | 三角色 `truncated=false`；消息内容与 v4.8 一致 |
| 从对话发起桌面任务 | 启动快照存在；决策提示词含【会话上下文】；无会话启动不报错 |
| Flow 长文本节点 | 节点成功；快照 `truncated=true`；输出保留头尾信息 |

## 6. 非目标与边界

- 不统一对话侧 `ContextPlan` 与场景预设；`chat_turn` 仅用于快照标注。
- 不更换 tokenizer；继续使用字符粗估 + 0.9 安全系数。
- 不新增任务/协作 UI 面板；快照通过时间线页与 `/api/events` 查看。
- 不对 Flow 节点输出做压缩，只限制输入提示词。
- 不做事件表结构变更与历史数据回填。

## 7. 风险

| 风险 | 对策 |
|---|---|
| 截断破坏关键指令 | 头尾保留 + 固定标记 + 仅超预算触发；单测断言首尾片段 |
| 协作事件量增大 | 每角色每轮最多一条；任务/Flow 节流 |
| 任务启动异步化引入回归 | 路由与定时任务两处 `await`；失败降级 null；定向测试覆盖 |
| 三角色窗口取最小值导致上下文块偏小 | 只在小窗口组合发生；上限 2000 兜底 |
| Flow 截断用户不可见 | 写入 flow scope 快照，时间线可查 |

## 8. 待拍板

| 编号 | 决策 | 建议 |
|---|---|---|
| D1 | 统一范围：轻量三层 vs v4.7 §11 全量 Pipeline | 轻量三层 |
| D2 | 桌面任务是否注入会话上下文 | 注入，失败降级 |
| D3 | Flow 节点是否 >90% 窗口才截断 | 是 |
| D4 | 快照粒度：协作每角色 / 任务首次+截断 / Flow 仅截断 | 采用 |
| D5 | 观测落点：复用 `session_events` | 采用 |
| D6 | 旧预算函数保留导出并委托 | 采用 |

## 9. 批准含义

批准本 Spec 即表示同意：

1. 按 §3 文件清单实施，不扩展到记忆合并、A/B 重放、UI 新页面；
2. 采用 §4.2 的确定性截断算法与 §4.3 的快照粒度；
3. 接受任务启动路径改为异步；
4. 以 §5 的命令与真机场景作为验收门禁。
