# v4.10 版本总结：上下文可见

> 版本：4.10.0（2026-11-19）
> 主题：跨场景快照面板、截断解释与快照构成增量
> 分支：`feat/v4.8-context-intelligence`
> 迁移：无数据库迁移；场景快照增量增加可选字段。
> 博客：[blog/v4.10](../../blog/v4.10/) 7 篇。

## 1. 本版解决什么

v4.9 已经把协作、任务与 Flow 的预算和快照写进事件日志，但用户看不到：

1. 非对话域预算只在 `/timeline` 与 `/api/events` 里，排障路径长；
2. 快照只有总量，看不出是角色提示重还是历史/观察长；
3. 协作 SSE 已经推送快照帧，但 reducer 直接丢弃；
4. 任务与 Flow 没有上下文入口；
5. 截断只有一行 `truncated=true`，没有下一步建议；
6. Flow 正常节点没有基线快照，面板无法回答「这个节点用了多少」。

v4.10 只做只读观测：不改提示词内容、预算公式、截断算法，也不新增数据库表。

## 2. 里程碑结果

| 阶段 | 结果 |
|---|---|
| M0 契约与统计 | 快照增加 `systemTokens` / `inputTokens` / `messageCount`；`fitPromptMessages` 统一计算 |
| M1 共享视图 | `context-snapshots` feature：解析/汇总纯函数、`useSceneSnapshots`、`SceneSnapshotPanel` |
| M2 协作接入 | reducer 保存快照（上限 24 条）；协作卡展示角色预算行 |
| M3 任务接入 | 任务展开时查询 task scope，展示「启动上下文块 / 任务决策」 |
| M4 Flow 接入 | 写入策略改为「首节点 + 截断」；执行面板运行中 5 秒轮询、终态停止 |
| M5 门禁与验收 | typecheck / check:lines / check:ascii / 定向测试 / i18n parity / `eval:agent` 全绿 |

## 3. 关键设计

### 3.1 快照增量而不是新契约

`sceneContextSnapshotPayloadSchema` 只增加三个可选字段：

- `systemTokens`：system 消息占用（截断后终值）；
- `inputTokens`：非 system 消息占用；
- `messageCount`：最终消息条数。

不变量：`systemTokens + inputTokens === promptTokens`，`messageCount === messages.length`。旧事件缺字段仍能解析，面板只显示总量。

`buildSceneSnapshot`（任务启动上下文块）不填这三个字段，因为它描述的是一个文本块的预算，不是消息装配。

### 3.2 一套纯函数 + 一套组件

新增 web feature `context-snapshots`：

- `parseSceneSnapshotEntries`：过滤事件类型、宽松解析、跳过无效载荷；
- `summarizeSceneSnapshots`：保留最近 N 条、按角色取最新、统计截断数；
- `latestByScene`：任务/Flow 这类无角色或混合角色场景按 scene 分行；
- `SceneSnapshotPanel`：预算条、窗口/预留、system/input、截断警告与建议。

三处消费共用同一套解析和展示，避免每个页面各写一份。

### 3.3 行选择规则

- 协作：所有快照都带角色时，按 planner → executor → reviewer 各取最新一条；
- 任务：混有 `task_start`（无角色）与 `task_step`（executor）时，按 scene 分行；
- Flow：取最新 `flow_node`。

这条规则是在浏览器验收中补上的：最初只看「有没有角色」，导致任务面板把 `task_start` 挤掉，只剩「执行」一行。

### 3.4 读取方式按场景选择

- 协作：直接用已经到达的 SSE 快照帧，不额外请求；
- 任务：仅在详情展开时查询 `/api/events`，运行中 5 秒刷新；
- Flow：执行面板打开时查询，运行中 5 秒刷新，终态停止。

面板组件在无快照时返回 `null`，不占位、不显示空态。

### 3.5 Flow 首节点基线

v4.9 只在截断时写 Flow 快照，导致正常节点没有基线。v4.10 改为：

- `llm` 节点每次装配后都上报统计；
- `flow-execution` 的 sink 决定是否落库：本 run 首条必写，之后仅 `truncated=true` 追加；
- 事件量从「每节点一条」降为「1 + 截断次数」。

### 3.6 截断解释

`truncated=true` 时面板变暖色，显示丢弃条数与被截断消息数，并给出建议：

- 协作/任务：换更大窗口模型、减少历史条数、关闭不必要的知识库；
- Flow：缩短上游节点输出或改用更大窗口模型。

建议只是文案，不自动修改配置。

## 4. 数据与验证

- 门禁：`pnpm typecheck`、`pnpm check:lines`、`pnpm check:ascii`、i18n parity 通过。
- 定向单测：core 16 项 + web 20 项通过；`pnpm eval:agent` 15/15。
- 真实 mock run：

| 场景 | 证据 |
|---|---|
| 协作快照字段 | planner 快照 `prompt=667`、`system=359`、`input=308`、`messageCount=2` |
| 任务面板 | `task_start` 58 / 2000；`task_step` 1139 / 6080；浏览器可见「启动上下文块」「任务决策」 |
| Flow 面板 | 单条 `flow_node` 基线 18 / 6080；浏览器可见「流程节点」行 |
| 旧事件兼容 | 缺新字段的载荷解析成功，只显示总量 |

## 5. 已知限制

- 协作卡的实时快照面板由 reducer 单测覆盖，浏览器验收聚焦任务与 Flow 两个历史可回看的页面。
- 任务面板的历史详情只读取事件，不重新装配上下文。
- Flow 面板只展示 `flow_node` 场景，不展示 agent 节点内部的三个角色快照（agent 节点仍走协作卡）。
- 快照不存正文，只存预算与计数；要回看具体消息仍需事件与原文。
- 不做记忆治理、A/B 重放、独立上下文中心页与并行/DAG。

## 6. 下一步

上下文工程 trilogy（v4.7 任务、v4.8 对话、v4.9 统一、v4.10 可见）到此收口。后续若要继续，优先评估：

1. 记忆统一治理：`recall(scene, budget)`、晋升/撤销/冲突可视化；
2. 离线 A/B 重放：同一会话或任务用两套策略重放，对比上下文构成与结果；
3. 并行 / DAG：先回答预算共享、幂等键与审查合并三个问题。
