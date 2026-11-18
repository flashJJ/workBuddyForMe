# Agent 对话任务优化：调研与借鉴计划

> 状态：v4.7 P0 开发中（P1/P2 待排期；§10/§11 为后续版本预研）
> 分支：`feat/v4.7-agent-task`（从 `main @ dc78d10f` 切出）
> 基线：v4.6.1（v4.6.1 Kokoro 修复已合 main）
> 主题：让任务模式从「一次性跑完的协作」升级为「带上下文、可压缩、可续跑、可干预、可观测」的 Agent 任务。
> 配套预研：v4.8「对话上下文智能调控」见 §10；v4.9「统一 Context Controller」见 §11。

## 1. 目标与 Non-Goals

### 目标

1. 任务模式能理解「这个会话刚才在聊什么」，不再从零开始。
2. 长任务的历史不再只靠固定 12 条步骤摘要，早期证据可回溯。
3. 运行中断/失败后可以继续，而不是直接终止。
4. 复杂任务执行前有计划确认，执行中有人工介入点。
5. 结果回投到会话时保留正文、证据与失败原因，而不是一行状态。

### Non-Goals

- 不做代码库索引 / IDE / 文件级上下文选择（与 Trae、Cursor 的编码 Agent 定位不同）。
- 不引入 LangGraph、CrewAI、AutoGen 等外部运行时依赖；只借鉴机制。
- 不做云端托管、跨设备同步；继续本地优先。
- 不在本期做多任务并行调度平台；并行/DAG 只做可行性预研。

## 2. 现状盘点

### 2.1 两条链路

```mermaid
flowchart LR
  U[聊天输入] -->|普通对话| C1[chat-orchestrator]
  U -->|任务模式| C2[POST /api/agent/runs]
  C2 --> S[agent-run-service]
  S --> R[agent-runner]
  R --> P[Planner]
  P --> E[Executor]
  E --> T[runTaskLoop]
  T --> V[Reviewer]
  V -->|reject| P
  V -->|approve| F[agent_runs / agent_handoffs]
  F --> K[run-completion 回投会话]
  C1 --> H[历史/摘要/记忆/工具循环]
```

- 普通对话：`packages/core/src/chat/orchestrator/chat-orchestrator.ts`，已有历史预算、递归摘要、长期记忆、工具结果压缩。
- 任务模式：`packages/core/src/agents/runner/agent-runner.ts` + `packages/core/src/agents/protocol/executor-adapter.ts` + `packages/core/src/agent/task-loop.ts`，三角色串行协作。
- 单 Agent 任务循环：`packages/core/src/agent/task-loop.ts`，被 Executor 复用；支持 `screen` / `tool` 两种观察模式。

### 2.2 已有能力

| 能力 | 现状 | 入口 |
|---|---|---|
| 三角色协作 | Planner → Executor → Reviewer，返工回 Planner | [agent-runner.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/runner/agent-runner.ts#L110-L233) |
| 结构化子任务单 | title / brief / acceptance / toolScopes / knowledgeBaseId | [planner-protocol.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/planner-protocol.ts#L30-L60) |
| 三重预算 | 轮次 3 / 步数 20 / token 80k（可调，有上下限） | [agent.ts](file:///e:/code/traeWork/workBuddyForMe/packages/shared/src/schemas/agent/agent.ts#L47-L60) |
| 工具 HITL | Executor 的写/危险工具逐次确认，SSE 下发 `agent_tool_confirm` | [executor-adapter.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/executor-adapter.ts#L170-L185) |
| 运行落库 | `agent_runs` / `agent_handoffs` / `task_runs` / `task_steps` | [agent-run-repo.ts](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/repositories/agent/agent-run-repo.ts#L71-L95) |
| 断线观察 | owner / observer 双客户端、`since` 续传、重启收敛 | [agent-run-service.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/runner/agent-run-service.ts#L137-L176) |
| 结果回投 | 终态后向会话追加一条助手消息（幂等） | [run-completion.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/work-plan/run-completion.ts#L75-L100) |
| 工具结果压缩 | 单条 20% 窗口预算 + 超长 spill | [tool-result-compact.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/tools/tool-result-compact.ts#L1-L46) |
| 协作评测 | mock 三角色协议，golden + 三开关反向 | [eval-agent.mjs](file:///e:/code/traeWork/workBuddyForMe/scripts/eval/eval-agent.mjs#L1-L33) |

### 2.3 关键缺口

| 优先级 | 缺口 | 证据 |
|---|---|---|
| P0 | 任务模式不读会话历史/摘要/长期记忆，Planner 只拿当前 `goal` | [planner-protocol.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/planner-protocol.ts#L87-L105) 的输入只有 goal + 返工历史 + 工具域 + 知识库 |
| P0 | Executor 只拿 `[子任务标题] + goal`，同样没有会话上下文 | [executor-adapter.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/executor-adapter.ts#L138-L170) |
| P0 | 任务步骤历史固定只取最近 12 条，且只留摘要，早期证据丢失 | [llm-planner.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agent/llm-planner.ts#L15-L16) |
| P0 | 回投正文丢失：协作只回 `finalOutcome.summary`；单 Agent 任务只回「已完成，共 N 步」 | [run-completion.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/work-plan/run-completion.ts#L20-L51) |
| P0 | 任务模式的用户消息不落 `messages` 表，只在 live + `agent_runs.goal` | [use-agent-task-turn.ts](file:///e:/code/traeWork/workBuddyForMe/apps/web/src/features/chat/hooks/use-agent-task-turn.ts#L76-L92)、[use-chat-session.ts](file:///e:/code/traeWork/workBuddyForMe/apps/web/src/features/chat/hooks/use-chat-session.ts#L237-L242) |
| P1 | 不可续跑：应用重启把 running 的协作统一落为 `cancelled(INTERRUPTED)` | [run-recovery.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/services/task/run-recovery.ts#L27-L35) |
| P1 | 无计划确认/澄清：Planner 协议只能输出子任务单，不能反问我方 | [planner-protocol.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/planner-protocol.ts#L30-L44) |
| P1 | 人工介入只有工具确认，没有「暂停/改计划/补充信息」 | [executor-adapter.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/protocol/executor-adapter.ts#L172-L184) |
| P2 | 串行单子任务，无并行/DAG | [agent-runner.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/agents/runner/agent-runner.ts#L110-L233) |
| P2 | 无任务级记忆（成功/失败经验、项目事实） | 现有长期记忆只从普通对话抽取 |
| P2 | 观测缺 per-role 上下文/token 拆解与压缩事件 | 只有 phase/handoff/review/budget 事件 |

## 3. 业界参考

### 3.1 LangGraph（持久化 + 中断恢复）

- **Checkpointer vs Store**：checkpointer 保存线程级图状态快照，用于会话连续性、HITL、时间旅行、容错；store 保存跨线程长期记忆。
- **Interrupt/Resume**：在节点内 `interrupt` 暂停，人工审批/编辑状态后从断点继续；要求副作用幂等。
- **Subgraph**：子图有独立 checkpoint 命名空间，跨边界数据走 store 或显式写父图。
- 可借鉴：任务运行级 checkpoint、暂停/恢复、按 thread 隔离状态、checkpoint 保留策略（防无限增长）。

### 3.2 OpenAI Agents SDK（Session + 恢复）

- `SQLiteSession` 自动保存/恢复会话历史，下一次 run 自动前置历史。
- 中断后可用同一个 session 恢复；`RunConfig.session_input_callback` 可自定义「历史 + 本轮输入」的合并/裁剪。
- `SessionSettings(limit=N)` 可限制读取的历史条数，存储不受影响。
- 可借鉴：任务 run 与会话 session 绑定、历史注入与裁剪回调、恢复时复用同一 session。

### 3.3 OpenHands SDK（Context Condenser）

- 事件日志 + Condenser：历史超过阈值时，保留首部关键事件（system/初始用户消息）与最近消息，中段交给 LLM 摘要，丢弃的事件替换为摘要；完整事件日志仍保留，可反序列化恢复。
- `LLMSummarizingCondenser(max_size, keep_first)` 是默认实现；摘要事件也进入日志。
- 官方称每轮 API 成本最多降 2x，长会话响应时间更稳定。
- 可借鉴：任务步骤的「首尾保留 + 中段摘要 + 可回溯」压缩，而不是固定 12 条截断。

### 3.4 CrewAI（层级流程）

- Sequential / Hierarchical 两种 process；层级模式由 manager LLM/agent 负责规划、派单、验收。
- Task 可通过 `context` 显式声明「依赖哪些前序任务输出」。
- 可借鉴：计划确认/派单语义、任务间显式上下文传递；不引入其运行时。

### 3.5 LangChain Deep Agents（上下文工程五件套）

- **Offloading**：大工具结果/用户消息落文件，模型只看预览，需要时再读。
- **Summarization**：上下文用量到 85% 时摘要旧消息，结果可恢复（写入 `conversation_history`）。
- **Skills**：任务知识按需加载，不常驻 system。
- **Subagents**：噪声大的探索在独立窗口完成，只回 1–2k token 摘要。
- **Long-term memory**：跨会话持久化。
- 可借鉴：与我们已有的 spill / 摘要 / 技能注入 / Executor 隔离一一对应，可把「任务笔记」做成可恢复文件。

### 3.6 Letta / MemGPT（分层记忆）

- Core memory 以带字符上限的 block 渲染进 system，archival memory 走外部向量库；`sleep-time` 后台整理记忆。
- 可借鉴：任务级「工作记忆 block」与「归档记忆」分离；任务结束后异步复盘，但要受本地资源与可解释性约束。

### 3.7 AutoGen（反面参考）

- Group chat 模式上手快，但控制流隐式；微软已建议新项目转向 Agent Framework。
- 借鉴其 reflection/handoff 语义即可，不借鉴运行时。

## 4. 借鉴映射

| 业界机制 | 我们的落点 | 复用 | 新增 |
|---|---|---|---|
| Session / thread 绑定 | `agent_runs.conversation_id` 已是天然 thread；补「任务上下文快照」 | 会话摘要、结构化事实、长期记忆 | `task_context_snapshots` 或在 `agent_runs` 加 context_json |
| Checkpoint / resume | 每轮/每步落检查点：round、subtask、step cursor、预算用量、待确认门 | `task_runs/task_steps`、lease | `task_run_checkpoints` + 恢复入口 |
| Condenser | 任务步骤「首 + 最近 K + 中段摘要」；摘要事件可回溯 | `summary-fidelity`、`spill` | `task_notes` / `task_condensations` |
| Plan approval | Planner 增加 `needs_input` / `plan` 输出；执行前暂停确认 | `agent_tool_confirm` 门控模式 | 新 SSE 事件 + 前端计划卡 |
| Subagent isolation | Executor 已是独立循环；补「只回摘要 + 证据引用」契约 | `buildExecutorOutcome` | outcome schema 扩展 |
| Offloading | 大观察/工具结果继续走 spill | `spill.ts` | 任务侧引用读取 |
| Observability | per-role prompt/token、压缩事件、上下文快照 | LangSmith trace、`agent_budget` 事件 | `agent_context` span/事件 |

## 5. 建议方案与优先级

### P0（本期必须）

1. **任务上下文注入**
   - Planner / Executor 注入：最近 N 轮会话（默认 6）、会话递归摘要、结构化事实、与 goal 相关的长期记忆、当前计划/待办。
   - 预算：独立 `taskContextBudget`，不挤占子任务单与工具目录；超限按「摘要 > 事实 > 原文」优先级裁剪。
   - 任务用户消息落 `messages` 表（或新增 `source='task'` 标记），保证回投后会话历史完整。

2. **结果回投完整化**
   - 协作：`finalOutcome.summary` + `evidence` + `citations` + 失败原因/未竟事项，一次写入助手消息。
   - 单 Agent 任务：回投最终 `done.message`，不再只写「已完成，共 N 步」。
   - 失败/预算触顶：回投保留可操作原因与已产出的最佳结果。

3. **任务历史 Condenser**
   - 替代 `HISTORY_STEP_CAP = 12` 的硬截断：保留首部（goal/验收标准/首个观察）与最近 K 步；中段按预算摘要为「任务笔记」。
   - 笔记对数字、URL、文件路径、id 做保真校验；原文仍在 `task_steps`，可按需读回。
   - 触发条件：任务步骤 token 超过预算 70%；摘要失败降级为「首 + 最近 K」。

### P1

4. **可续跑**
   - 每个 round/step 落检查点；重启后 UI 提供「继续运行」而不是直接 cancelled。
   - 恢复前校验：预算余量、待确认门、工具幂等键；写操作必须带幂等标记，避免重复执行。
   - 保留手动「终止并归档」。

5. **计划确认 / 澄清**
   - Planner 协议新增 `needs_input`（向用户提问）与 `plan`（多步子任务预览）。
   - 复杂任务（toolScopes 含 desktop / 预计步数 > 阈值）默认走「先确认计划」，简单任务可自动执行。
   - 前端：计划卡可编辑验收标准、增删子任务、批准后执行。

### P2

6. 子任务并行 / DAG（先做 2 路只读并行试点）。
7. 任务级记忆：成功路径、失败原因、项目事实，任务结束后异步写入长期记忆。
8. 观测：per-role prompt/token、上下文快照、压缩事件、回放与对比。

## 6. 里程碑与验收

| 里程碑 | 交付 | 验收 |
|---|---|---|
| M0 契约冻结 | 新 schema/迁移/事件类型；Non-Goals 评审 | 迁移幂等、schema 单测、事件契约测试 |
| M1 上下文注入 | Planner/Executor 上下文块 + 预算 + 用户消息落库 | 跨轮追问任务 golden 通过；token 不超预算 |
| M2 任务 Condenser | 首尾保留 + 中段摘要 + 保真 + 可回溯 | 长任务关键信息保留率 ≥ 90%；压缩失败可降级 |
| M3 可续跑 | checkpoint + 恢复入口 + 幂等保护 | 重启后续跑成功率 ≥ 95%；无重复写操作 |
| M4 计划确认/回投 | 计划卡 + needs_input + 完整回投 | 复杂任务先确认；回投含正文/证据/失败原因 |
| M5 观测与评测 | per-role 指标 + 评测集扩展 | 基线对比报告；门禁化 |

## 7. 评测设计

扩展现有 [eval-agent.mjs](file:///e:/code/traeWork/workBuddyForMe/scripts/eval/eval-agent.mjs)：

| 场景 | 断言 |
|---|---|
| 跨轮追问 | 任务模式能引用上一轮结论/约束，不再反问主题 |
| 长任务（>20 步） | 早期关键数字/URL/文件名在后续步骤仍可引用 |
| 重启恢复 | 中断后继续，步骤不重复、结果完整 |
| 计划确认 | 复杂任务先出计划；拒绝后不执行 |
| 结果回投 | 会话消息含正文、引用与未竟事项 |
| 失败路径 | 预算触顶/工具熔断仍回投最佳结果与原因 |

指标：上下文追问准确率、关键信息保留率、恢复成功率、平均步数、平均 token/任务、失败率、人工干预次数。

## 8. 风险与取舍

| 风险 | 应对 |
|---|---|
| 上下文注入让 Planner 更啰嗦、更贵 | 独立预算 + 相关性筛选 + 只注入摘要/事实，不注入全量原文 |
| 压缩丢关键 id/URL/数字 | 保真校验 + 首部保留 + `task_steps` 可回溯 |
| 续跑导致写操作重复 | 幂等键 + 恢复前门控 + 写操作二次确认 |
| 计划确认增加交互成本 | 仅复杂任务触发；简单任务默认直跑 |
| 任务笔记与长期记忆重复 | 任务笔记只服务当前 run；结束后再决定是否晋升长期记忆 |
| 引入外部框架依赖 | 明确 Non-Goal：只借鉴机制，不引入运行时 |

## 9. 调研方法与待决问题

已做：

1. 读代码：两条任务链路、三角色协议、Executor 循环、回投、恢复、预算、HITL、评测。
2. 读业界文档：LangGraph persistence/interrupts、OpenAI Agents SDK sessions、OpenHands condenser、CrewAI processes、LangChain Deep Agents、Letta、AutoGen。
3. 跑门禁：`pnpm check` 全绿（v4.6.1 收尾）。

待评审确认：

- 续跑采用「新表 `task_run_checkpoints`」还是「复用 `task_steps` + cursor」。
- 计划确认默认策略：复杂任务强制 / 全局可配 / 首版只读预览。
- 任务用户消息是否进 `messages` 表（会影响会话列表、导出、分享与摘要链路）。
- 任务 Condenser 用当前对话模型还是角色 Planner 模型（成本 vs 质量）。

### 9.1 v4.7 P0 实施口径（已定，开发中）

P0 先按以下默认口径落地，P1 项（续跑、计划确认）再单独拍板：

| 决策 | 口径 | 理由 |
|---|---|---|
| 任务用户消息 | 进 `messages` 表；服务端在创建 run 前落库，紧邻同内容重发不重复 | 保证回投后会话历史完整，导出/分享/摘要自动生效 |
| 任务上下文来源 | 会话摘要 → 结构化事实/检查点 → 当前计划 → 近期 6 条对话 → 相关长期记忆 | 高密度优先；token 超限从尾部截断 |
| 上下文预算 | 独立配额并按模型窗口收敛：上下文 15%（320–2000 tokens）、历史步骤 12%（320–1200 tokens） | 云端长上下文用满上限；本地 4096 档自动收敛，避免顶穿窗口 |
| 任务历史 Condenser | 首 2 步 + 最近 8 步逐条保留，中段按窗口解析的预算聚合为省略摘要 | 确定性、可单测、无额外模型调用与失败路径 |
| 中段 LLM 摘要 | 留到 v4.8，与对话侧共用压缩器后再切换 | 避免两条链路各写一套摘要口径 |
| 结果回投 | 协作补证据名称与未竟事项；单 Agent 任务回投 final 步正文 | 回投不再只有一行状态 |

### 9.2 模型窗口分档（v4.7 P0 已实现）

先厘清三个常被混用的数字（以 Qwen2.5-7B-Instruct 为例）：

| 数字 | 含义 | 来源 |
|---|---|---|
| 8192 | **单次最大生成长度**（max output），不是上下文窗口 | Qwen2.5 模型卡 |
| 32768 | 架构上下文长度（`max_position_embeddings`，未开 YaRN） | 模型 config |
| 131072 | 完整上下文长度（需 YaRN/vLLM 等运行时支持） | Qwen2.5 模型卡 |

项目里的 `DEFAULT_CONTEXT_TOKEN_BUDGET = 8192` 是「模型未配置窗口时的保守兜底预算」，不是把 7B 的生成长度当窗口；Ollama 发现侧则显式按运行时 `num_ctx` 默认值报 4096。但兜底值恰好与 7B 生成长度相同，容易误读，因此 P0 起任务侧不再用固定值，而是按窗口分档：

| 模型档位 | 窗口 | 任务上下文预算 | 历史步骤预算 |
|---|---|---|---|
| Ollama 运行时默认（qwen2.5:7b `num_ctx`） | 4096 | 614 | 491 |
| 未配置窗口的兜底 | 8192 | 1228 | 983 |
| Qwen2.5 7B 架构默认（未开 YaRN） | 32768 | 2000 | 1200 |
| Qwen2.5 7B 完整 / 云端长上下文 | 131072 / 1M | 2000 | 1200 |

规则：`上下文预算 = clamp(窗口 × 15%, 320, 2000)`，`历史预算 = clamp(窗口 × 12%, 320, 1200)`；两者独立，不与工具目录、子任务单互相挤占。窗口未知时才退回 8192 兜底。

## 10. 下一版本预埋：对话上下文智能调控（v4.8）

> 定位：v4.7 建机制，v4.8 做策略。不是重复实现，而是在同一套事件日志/压缩器/记忆策略之上加「意图与策略编排」。

### 10.1 为什么放到 v4.8

- v4.7 的 Condenser、事件日志、检查点、记忆策略是两条链路共用的底座；先做任务侧，避免对话侧另起炉灶后再重构。
- 对话侧已有零散能力：70% 阈值递归摘要、50/25/10/10 分层预算、工具结果压缩、记忆抽取/去重/衰减。v4.8 的工作是把它们收敛为一个 **Context Controller**，不是从零做。
- 需要 v4.7 先冻结的契约：事件日志（复用 `session_events` 或新表）、`condensation` 事件、上下文快照、任务笔记/会话笔记的读取接口。

### 10.2 六个优化点

1. **意图识别与路由**
   - 每轮判定：闲聊 / 知识问答 / 追问 / 工具任务 / 澄清 / 记忆写入（记住/忘掉）/ 提醒。
   - 规则优先 + 小模型兜底；输出 confidence 与 fallback，低置信度不改变上下文策略。
   - 路由结果决定：是否检索、是否带工具、是否注入记忆、是否触发压缩、是否建议进入任务模式。

2. **混合上下文加工**
   - 固定头（system / 人设 / 硬约束 / 当前目标）+ 最近逐字尾 + 中段摘要 + 结构化事实 + 召回记忆 + 工具证据。
   - 每块独立配额与优先级；按意图动态调整：追问侧重最近原文，知识问答侧重 RAG，任务侧重计划/检查点。
   - 去重与冲突消解：同一事实以最新/高置信为准，冲突保留双方并标注。

3. **保留首尾、中段摘要、完整事件日志可回溯**
   - 事件日志只追加不删除；压缩产生 `condensation` 事件，渲染时应用：移除旧事件、插入摘要。
   - 保留首部（系统/首问/约束）与最近 K 条；中段摘要；原文按事件 id 可读回（本地）。
   - 与 OpenHands Condenser 同构，避免「摘要即丢失」。

4. **智能适时压缩**
   - 触发不止 token 70%：话题切换、任务边界、模型切换、窗口变小、用户显式「压缩/重开」。
   - 预判式：下一轮装配前评估预算，必要时先压缩再请求，而不是撞墙后截断。
   - 压缩失败回退为「首 + 最近 K」，不阻塞回答。

5. **长期记忆的智能更新**
   - 写入：意图识别「记住/忘掉」+ 抽取器 salience 评分；低价值不入库。
   - 合并：同主体/同 key 去重合并；冲突标记而非静默覆盖。
   - 保留：importance × recency × usage 衰减；置顶与 constraint 不衰减；归档可恢复。
   - 晋升：任务笔记/会话摘要 → 长期记忆需过阈值并可审计；用户可见「记住了什么、为什么」。

6. **评测与可观测**
   - 指标：意图准确率、压缩保真率、记忆精确率/召回率、跨轮追问准确率、token/成本、用户纠正次数。
   - 上下文快照与压缩事件可在会话详情查看，支持回放。

### 10.3 版本序列

| 版本 | 主题 | 依赖 |
|---|---|---|
| v4.7 | 任务侧底座：上下文注入、Condenser、续跑、计划确认 | 无 |
| v4.8 | 对话侧智能调控：意图路由、混合装配、自适应压缩、记忆治理 | 复用 v4.7 的事件日志/压缩器/检查点 |
| v4.9 | 统一 Context Controller：对话与任务共用策略层，按场景切换 | v4.8 策略 + v4.7 任务状态 |

### 10.4 待确认

- 意图识别用规则 / 小模型 / 主模型哪一档，是否允许额外模型调用。
- 对话事件日志复用 `session_events` 还是新表。
- 「记住/忘掉」是否作为一等意图暴露给用户。
- v4.8 是否要求 v4.7 全部里程碑完成，还是可并行（建议事件日志与压缩器先冻结）。

## 11. 再下一版本预埋：统一 Context Controller（v4.9）

> 定位：v4.7 有任务侧上下文，v4.8 有对话侧调度；v4.9 把两套「装配 + 压缩 + 记忆 + 观测」收敛成一个控制器，按场景切策略，而不是两条链路各写一套。

### 11.1 为什么需要 v4.9

- v4.8 之后会出现两套相似但独立的实现：对话的 `turn-context-assembly` 与任务的上下文注入块，压缩器、记忆读写、预算计算各有一份。
- 两套实现的直接代价：同一份摘要口径不一致、同一事实在两条链路重复入库、token 预算无法统一解释、评测需要跑两遍。
- v4.9 不改业务语义，只做「收敛 + 策略化」：一个入口、一份事件日志、一套压缩与记忆规则、一组场景预设。

### 11.2 统一抽象

```mermaid
flowchart TB
  REQ[请求: chat turn / task step] --> CTRL[ContextController]
  CTRL --> SCN[SceneResolver<br/>对话/任务/子代理]
  SCN --> POL[PolicySet<br/>预算/保留/压缩/记忆]
  POL --> PIPE[Pipeline]
  PIPE --> S1[Collector<br/>历史/摘要/事实/记忆/证据]
  S1 --> S2[Deduper/Conflict<br/>去重与冲突消解]
  S2 --> S3[Compressor<br/>首尾保留+中段摘要]
  S3 --> S4[Packer<br/>按优先级装包与裁剪]
  S4 --> OUT[LLM 请求]
  PIPE --> LOG[(事件日志)]
  S3 --> LOG
  LOG --> RENDER[回放/审计/评测]
```

核心对象（先定契约，不先定实现）：

| 对象 | 职责 | 关键字段 |
|---|---|---|
| `ContextRequest` | 一次装配请求 | `scene`、`conversationId`、`runId?`、`modelId`、`tokenBudget`、`goal` |
| `ContextSource` | 可装配的上下文来源 | `kind`（history/summary/fact/memory/evidence/tool）、`priority`、`render()`、`cost()` |
| `PolicySet` | 场景策略预设 | 分层配额、保留首尾条数、压缩阈值、记忆注入开关 |
| `ContextSnapshot` | 装配结果快照 | `blocks`、`dropped`、`compressedEvents`、`tokenUsage` |
| `CondensationEvent` | 压缩事件（只追加） | `fromIds`、`toId`、`reason`、`fidelity` |

### 11.3 场景策略矩阵

| 场景 | 头部固定 | 尾部逐字 | 中段 | 记忆 | 压缩触发 |
|---|---|---|---|---|---|
| 闲聊 / 追问 | system + 人设 | 最近 6–10 轮 | 摘要 | 仅相关 | 70% 或话题切换 |
| 知识问答 | system + 检索规则 | 最近 2 轮 | 摘要 + 证据 | 相关事实 | 证据超预算先裁证据 |
| 工具任务 | system + 工具约束 | 最近 3 轮 + 当前步 | 摘要 + 计划/检查点 | 任务相关 | 步骤边界优先 |
| 子代理（Executor） | 角色提示 + 验收标准 | 最近 2 步 | 任务笔记 | 不注入全局记忆 | 只回摘要 |

策略以「预设 + 覆盖」表达：`chatDefault`、`chatKnowledge`、`taskStep`、`subagent`；单次请求可覆盖阈值但仍受硬上限约束。

### 11.4 事件日志与压缩统一

- 统一为**只追加事件日志 + 渲染视图**：对话消息、任务步骤、压缩事件同构，渲染时按视图取舍。
- 压缩只产生 `CondensationEvent`，不改原事件；原文可按 `fromIds` 读回，保证可回溯。
- 一份压缩实现服务三条链路：超阈值摘要、任务中段摘要、工具结果溢出摘要，共用保真校验（数字/日期/URL/路径/id）。
- 失败降级统一为「首 + 最近 K」，不阻塞主请求。

### 11.5 记忆统一治理

| 环节 | 统一规则 |
|---|---|
| 写入 | 意图「记住」+ 抽取器 salience 双通道；同一事实只入一次 |
| 合并 | 同主体同 key 合并；冲突保留双方并标注来源与时间 |
| 保留 | `importance × recency × usage` 衰减；constraint/置顶不衰减 |
| 晋升 | 任务笔记/会话摘要晋升长期记忆需过阈值，可审计、可撤销 |
| 读取 | 统一 `recall(query, scene, budget)`，按场景给不同配额 |

### 11.6 可观测与回放

- 每次请求落 `ContextSnapshot`：哪些块入选、被裁了什么、压缩了哪些事件、token 分布。
- 会话/任务详情页可查看「本轮上下文构成」，支持按事件 id 回看原文。
- 评测统一到一张表：意图准确率、关键信息保留率、压缩保真率、记忆精确率/召回率、token/成本、用户纠正次数。
- 支持 A/B：同一会话用两套 PolicySet 重放，对比结果与成本（离线，不影响线上）。

### 11.7 里程碑

| 里程碑 | 交付 | 验收 |
|---|---|---|
| N0 契约冻结 | `ContextRequest/Source/PolicySet/Snapshot` 类型与事件 schema | 类型单测；迁移幂等；旧链路可映射 |
| N1 统一装配 | 对话与任务都走 `ContextController.collect()`，输出等价 | 回归：两条链路输出与本版本前一致（允许顺序差异） |
| N2 统一压缩 | 一份压缩器替换三处实现，共用保真校验 | 保真率不低于 v4.7/v4.8 基线；失败可降级 |
| N3 统一记忆 | 单一记忆服务 + `recall(scene, budget)` | 无重复写入；冲突可见；可撤销 |
| N4 观测与回放 | 快照、上下文构成视图、离线 A/B | 可复现任意一轮上下文；对比报告可导出 |

### 11.8 风险与取舍

| 风险 | 应对 |
|---|---|
| 大重构导致对话/任务同时回归 | N1 只做「等价替换」，不改语义；保留旧链路开关一个版本 |
| 统一策略抹平场景差异 | 策略矩阵显式化，场景预设独立可调，硬上限兜底 |
| 事件日志膨胀 | 分卷 + 冷归档；渲染视图与存储解耦 |
| 统一后单点故障影响两条链路 | 控制器无状态、纯函数装配；异常回落到「最近 K 条」 |
| 过度抽象增加理解成本 | 只抽 5 个对象；不为假设场景预留扩展点 |

### 11.9 待确认

- 事件日志是否在 v4.7/v4.8 就统一建模（推荐是），避免 v4.9 再做数据迁移。
- 旧链路开关保留多久（建议一个 minor 版本，默认新链路）。
- 是否需要「按会话固定 PolicySet」能力，还是每次请求动态决定。
- 离线 A/B 是否纳入门禁，或只作为人工分析工具。

## 12. 参考资料

- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph Interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- OpenAI Agents SDK Sessions: https://openai.github.io/openai-agents-python/sessions/
- OpenHands Context Condenser: https://docs.openhands.dev/sdk/guides/context-condenser
- OpenHands SDK 论文（Context Window Management）: https://arxiv.org/html/2511.03690v2
- CrewAI Processes: https://docs.crewai.com/en/concepts/processes
- LangChain Deep Agents 上下文工程: https://www.langchain.com/blog/context-engineering-deep-agents-remember
- Letta / MemGPT 记忆分层: https://www.aiwiki.ai/wiki/letta
- AutoGen 维护状态与迁移建议: https://learn.microsoft.com/fil-ph/training/modules/aaai-implement-multi-agent-orchestration-azure-ai-foundry/6-compare-orchestration-frameworks
