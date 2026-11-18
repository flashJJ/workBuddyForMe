# v4.9 版本总结：统一上下文控制器

> 版本：4.9.0（随 v4.10.0 批量发布）
> 主题：场景策略、预算单一真源、提示词装包与跨域快照
> 分支：`feat/v4.8-context-intelligence`（v4.9 提交位于该分支）
> 迁移：无数据库迁移；新增事件类型 `context_scene_snapshot`。
> 博客：[blog/v4.9](../../blog/v4.9/) 7 篇。

## 1. 本版解决什么

v4.7 有任务侧上下文，v4.8 有对话侧策略，但两套实现开始分叉：

1. 任务上下文与步骤历史各自维护预算公式，改一处漏一处；
2. 协作上下文块按 Executor 窗口装配，Planner 可能绑定更小窗口；
3. 上下文块、工具目录、步骤历史分别受控，但整段提示词没有总上限；
4. 桌面任务不读会话上下文，从对话里发起任务要重复交代背景；
5. Flow LLM 节点没有窗口上限，长输入可能直接超窗；
6. 观测只覆盖对话，协作/任务/Flow 的预算是否吃紧不可见。

v4.9 只取 v4.7 §11 预研中「直接消除分叉」的三层：场景策略、预算解析、提示词装配与快照；不做全量 Controller Pipeline。

## 2. 里程碑结果

| 阶段 | 结果 |
|---|---|
| M0 契约与策略 | `CONTEXT_SCENES`、`CONTEXT_BUDGET_PRESETS`、`resolveClampedBudget`、`fitPromptMessages`、`recordSceneSnapshot` |
| M1 预算收口 | 任务上下文与步骤历史委托单一公式；4096 / 32768 / 1M / 1000 / null 数值与旧实现一致 |
| M2 协作域 | Planner / Reviewer / Executor 装配前统一装包；上下文块窗口取三角色最小值；每角色写快照 |
| M3 任务域 | 桌面任务启动注入会话上下文；决策器首条 + 截断时写 `task_step` 快照 |
| M4 Flow 域 | LLM 节点超窗截断；仅截断时写 `flow_node` 快照；未超预算逐字不变 |
| M5 观测与评测 | 时间线新增「上下文快照：场景」；`eval:agent` 增加快照断言 |

## 3. 关键设计

### 3.1 场景是纯数据

七个场景：`chat_turn / collab_plan / collab_exec / collab_review / task_start / task_step / flow_node`。

两个预算预设保持 v4.7 / v4.8.1 的实测值：

| 预设 | 窗口比例 | 下限 | 上限 |
|---|---|---|---|
| `contextBlock` | 15% | 320 | 2000 |
| `stepHistory` | 12% | 320 | 1200 |

`resolveClampedBudget` 只有一行公式：`max(min, min(max, floor(window × ratio)))`；窗口未知返回上限。旧函数保留导出并委托，减少改动面。

### 3.2 单次提示词预算

`fitPromptMessages(messages, { contextWindow, scene, role, reserveTokens? })`：

1. `usableWindow = floor(window × 0.9)`；
2. `reserve = resolveReserveTokens(null, window)`；
3. `budget = max(64, usableWindow − reserve − 64)`；
4. 超预算时先丢最旧的非 system、非末条消息；
5. 仍超限时截断最大消息，保留头 60% / 尾 40%，插入固定省略标记；
6. 最后才从尾部截断 system。

末条消息永不丢弃，只可能被截断；图片按既有估算计入，截断只作用于文本。

### 3.3 协作上下文块取三角色最小窗口

OpenAI 兼容服务通常按「请求模型」校验窗口。Planner 可能绑定小窗口模型，如果上下文块按 Executor 大窗口装配，Planner 侧就会超窗。

因此协作上下文块窗口改为 Planner / Executor / Reviewer 三个模型窗口的最小值；任一角色未配置时跳过，全部失败才回落上限 2000。

### 3.4 桌面任务启动注入会话上下文

`resolveTaskLaunchArtifacts` 改为异步：启动时装配会话上下文块，失败返回 `null`，不阻断任务。

上下文块复用 v4.7 的 `buildTaskContextBlock`，按「摘要 → 事实/检查点 → 计划 → 近期对话 → 长期记忆」装配；`task_start` 快照记录上下文块预算与实际占用。

### 3.5 快照是增量事件

`context_scene_snapshot` 写入现有 `session_events`：

- scope：`agent` / `task` / `flow`；
- scopeId：`agentRunId` / `taskRunId` / `flowRunId`；
- payload：场景、角色、窗口、可用窗口、输出预留、预算、实际 prompt、截断/丢弃计数。

不新增表、不做数据迁移；沿用 180 天保留。Flow 只在本节点发生截断时写快照，控制事件量。

## 4. 数据与验证

- 门禁：`pnpm typecheck`、`pnpm check:lines`、`pnpm check:ascii` 通过。
- 定向测试：预算、装配、任务上下文、步骤压缩、协作客户端、runner、Flow handler、任务启动等 55 项通过。
- 离线评测：`pnpm eval:agent` 15/15 通过，含快照数量、角色与预算不变量断言。
- 真机（本地 4096 qwen2.5:7b + 1M 云端模型）：

| 场景 | 证据 |
|---|---|
| 4096 协作 | 三角色 `promptTokens` 466 / 586 / 348，预算 3008，均未截断 |
| 桌面任务启动 | `task_start` 54 / 614；`task_step` 979 / 3008，未截断 |
| Flow 长文本节点 | `flow_node` 3004 / 3008，`truncated=true`，运行成功 |
| 1M 大窗口 | planner `contextWindow=1048576`、`budgetTokens=941606`、`prompt=439`，未截断 |

## 5. 已知限制

- 任务/协作/Flow 的快照通过时间线页与 `/api/events` 查看，没有独立上下文面板（v4.10 补齐）。
- Flow 只在截断时写快照，正常节点没有基线（v4.10 改为首节点 + 截断）。
- 大窗口验收中 Executor 上游调用挂起后被取消；三角色共用同一预算函数，4096 档已完整验证。
- 桌面任务在纯 Web 模式下没有截图能力，验收只验证启动上下文与预算快照。
- 不统一记忆写入语义，不做 A/B 重放，不做并行 / DAG。

## 6. 下一步

v4.10 把 v4.9 写入事件的快照变成用户可见的「上下文预算」面板：协作卡、任务详情与 Flow 执行面板共用一套解析、汇总与展示组件，并对截断给出解释与建议。
