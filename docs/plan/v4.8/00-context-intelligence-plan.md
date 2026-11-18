# 对话上下文智能调控（v4.8）：调研与实施计划

> 状态：开发中（M0–M4 已落地；M5 事件与时间线已接入，专用面板待补）
> 前置：v4.7 任务侧 P0/P1/P2 已完成（见 [v4.7 计划](../v4.7/00-agent-task-research-plan.md)）
> 一句话：把对话侧已有的「摘要 + 预算 + 记忆」从零散能力收成一套按意图分配上下文的 Controller，并把压缩从「撞墙后折叠」升级为「事件化、可回溯、可预判」。

## 1. 目标与非目标

### 目标

| 编号 | 目标 | 验收 |
|---|---|---|
| G1 | 每轮识别意图并输出置信度 | 规则命中率可统计；低置信度回退默认策略，不改变答案语义 |
| G2 | 上下文按意图分块装配 | 追问、知识问答、任务建议三类场景的块配额可区分；追问不再被摘要挤掉最近原文 |
| G3 | 压缩事件化 | 每次压缩产生 `context_condensed` 事件；原文按消息 id 可读回；摘要失败降级「首 + 最近 K」 |
| G4 | 压缩时机智能化 | 保留 70% 阈值，新增高水位预判与用户显式触发；压缩不再只在回合后发生 |
| G5 | 长期记忆可治理 | 「记住 / 忘掉」成为一等意图；冲突保留双方并标注；晋升有来源可审计 |
| G6 | 本地可观测 | 会话详情可看上下文构成、压缩历史、意图标签；不依赖 LangSmith |

### 非目标

- 不做跨会话共享上下文，上下文仍以会话为边界。
- 不改检索排序、嵌入模型与知识库编译链路。
- 不引入外部向量库、云记忆或云 trace。
- 不自动切换任务模式，只在意图层给出「建议进入任务模式」信号。
- 不在本版统一对话与任务两套装配；统一留给 v4.9，但本版先抽 `ContextPlan` 接口与之对齐。

## 2. 现状盘点

### 2.1 已有能力

| 能力 | 现状 | 位置 |
|---|---|---|
| 回合装配 | 历史 → 记忆召回 → 技能/计划/检查点 → 工具声明 → 预算裁剪 | [turn-context-assembly.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/context/turn-context-assembly.ts) |
| 历史预算 | `窗口 − system − tools − 输出预留`，原文硬上限 50% 窗口；从新到旧装填 | [context-budget.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/context/context-budget.ts) |
| 回合后压缩 | 历史占用 > 70% 触发，折叠最旧消息，保留约 50% 逐字后缀（至少 4 条） | [summarizer.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/context/summarizer.ts) |
| 结构化摘要 | JSON 摘要 + facts/decisions/open_loops；数字/日期保真校验与重试 | [summarizer.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/context/summarizer.ts) |
| 配额 | history 50% / summary 25% / facts 10% / memory 10% | [chat.ts](file:///e:/code/traeWork/workBuddyForMe/packages/shared/src/constants/chat.ts) |
| 长期记忆 | 召回、去重、衰减、约束置顶、事件 rollup、图边 | [memory-service.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/memory/memory-service.ts) |
| 事件日志 | `session_events` 已有 chat scope：`message_started/completed`、`tool_trace`；FTS + 180 天保留 | [session-event-repo.ts](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/repositories/chat/session-event-repo.ts) |
| 任务侧上下文 | 任务上下文注入、step-condenser、检查点、续跑 | [task-context.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/work-plan/task-context.ts) |

### 2.2 关键缺口

| 缺口 | 现状表现 | 影响 |
|---|---|---|
| 无意图识别 | 所有轮次同一套装配；闲聊也检索、也召回记忆 | token 浪费；追问被摘要与事实挤占 |
| 压缩只在回合后 | 当轮撞墙只能硬截断（`assembleHistoryWithinBudget` 直接丢弃旧消息） | 长对话中段信息无摘要补偿 |
| 摘要写回无事件 | `conversations.summary/summary_turns` 是唯一真源 | 无法回放「当时为何这样压缩」；跨版本难对比 |
| 记忆写入靠抽取器 | 用户说「记住」没有显式通道；「忘掉」无审计 | 可解释性差，误记难纠正 |
| 观测仅外部 trace | 本地只有 `context_budget` span | 用户与离线评测都看不到上下文构成 |
| 无场景策略 | 追问 / 知识问答 / 任务建议同权重 | 场景差异被抹平，压缩质量不稳定 |

## 3. 业界参考（承接 v4.7 §3，不重复）

| 来源 | 可借鉴 | 不照搬 |
|---|---|---|
| LangGraph Checkpointer | thread 级状态快照、时间旅行、HITL | 不做图执行引擎 |
| OpenHands Condenser | 首尾保留 + 中段摘要 + 原文可回溯 | 不做工具级微压缩 |
| LangChain Deep Agents | 上下文工程五件套、文件化任务笔记 | 不引入虚拟文件系统 |
| Letta / MemGPT | 分层记忆、自编辑记忆（记住/忘掉） | 不做常驻记忆守护进程 |
| v4.7 任务侧 | 事件化、预算分档、检查点 | 不把任务检查点塞进对话 |

结论：底座已有约六成，v4.8 的重点不是新增存储，而是「意图 → 策略 → 可回溯」。

## 4. 方案

### 4.1 总览

```mermaid
flowchart LR
  U[用户消息] --> I[意图识别]
  I --> P[ContextPlan 策略]
  P --> A[分块装配]
  A --> L[主模型请求]
  L --> C[回合后压缩/事件]
  C --> E[(session_events)]
  A -. 快照统计 .-> E
  E --> V[会话详情回放]
```

### 4.2 P0 意图识别与路由

- 输出契约：`TurnIntent { kind, confidence, signals[], suggestedTaskMode }`。
- 类型：`chitchat | knowledge | follow_up | tool_task | clarify | memory_write | reminder`。
- 规则优先：关键词/正则（记住、忘掉、提醒、之前说的、继续）、是否带附件、是否引用上轮、消息长度、是否含 URL/文件路径。
- 小模型兜底：仅在规则无命中且配置了本地小模型时调用；超时（默认 800ms）或未配置直接回退规则。
- 路由矩阵：

| 意图 | 检索 | 工具 | 记忆召回 | 压缩策略 | 任务模式建议 |
|---|---|---|---|---|---|
| chitchat | 否 | 否 | 仅约束/偏好 | 宽松 | 否 |
| knowledge | 是 | 按需 | 是 | 标准 | 否 |
| follow_up | 否 | 否 | 是 | 尾部优先 | 否 |
| tool_task | 视子任务 | 是 | 是 | 尾部优先 | 是 |
| clarify | 否 | 否 | 是 | 宽松 | 否 |
| memory_write | 否 | 否 | 是 | 宽松 | 否 |

- 低置信度（< 0.6）不改变现有行为，走默认策略；意图只用于「加资源」，不用于「减资源」，避免误判导致漏检索。
- 意图标签随本轮事件落库，供观测与评测；不进入用户可见正文。

### 4.3 P1 混合上下文装配

- 分块：`HEAD`（system/人设/硬约束/当前目标）、`TAIL`（最近逐字）、`MIDDLE`（摘要 + 结构化事实）、`MEMORY`（召回）、`EVIDENCE`（RAG/工具结果）。
- 每块独立配额，由 `ContextPlan` 给出；默认沿用现有 50/25/10/10，按意图调整：

| 意图 | TAIL | MIDDLE | MEMORY | EVIDENCE |
|---|---|---|---|---|
| follow_up | 60% | 15% | 10% | 15% |
| knowledge | 35% | 15% | 10% | 40% |
| tool_task | 40% | 15% | 10% | 35% |
| 默认 | 50% | 25% | 10% | 15% |

- 去重与冲突：同一 subjectKey 在 facts / memory / summary 中出现时，按「更新时间 + 置信度」选一，另一方保留但标注；硬约束永远优先。
- 落点：新增 `context-plan.ts` 纯函数（输入窗口、意图、块估算，输出配额与裁剪顺序），`prepareTurnContext` 先算 plan 再装配；`buildChatMessages` 的签名尽量不变，避免一次性大改。
- 预算继续按模型窗口自适应，未知窗口才回退 8192 兜底。

### 4.4 P1 压缩事件化与预判

- 新事件：`context_condensed`（scope `chat`），payload：

```json
{
  "trigger": "threshold|preflight|model_change|user_explicit",
  "foldedMessageIds": ["..."],
  "summary": "合并后的摘要",
  "facts": [{ "key": "...", "value": "..." }],
  "beforeTokens": 12000,
  "afterTokens": 7000,
  "fidelityMissing": [],
  "degraded": false
}
```

- `conversations.summary/summary_turns` 继续作为读取投影，事件作为审计真源；两者同一事务写入，事件失败不阻断摘要写回。
- 触发条件：
  - `threshold`：现有回合后 70%（保留）。
  - `preflight`：下一轮装配前估算占用 > 85%，先压缩再请求（多一次模型调用，默认仅高水位触发）。
  - `model_change`：模型窗口变小导致预算不足。
  - `user_explicit`：用户显式「压缩/重开」。
- 话题切换先只记录信号（意图变化 + 与最近摘要相似度低），不自动压缩；积累数据后再决定是否开启。
- 失败降级：摘要不可用时保留「首 + 最近 K」，事件标 `degraded: true`，不阻塞回答。

### 4.5 P2 长期记忆治理

- 「记住 / 忘掉」作为一等意图：
  - 记住：写 `constraint` 或 `fact`，带 subjectKey、来源消息 id、重要度；重复则合并。
  - 忘掉：软删 + 审计事件；歧义时先反问（进入 `clarify`）。
- 晋升：会话事实 / 任务笔记 → 长期记忆需过重要度阈值，并记录来源（conversationId / runId / messageId）。
- 冲突：同 key 保留双方并标注 superseded，不静默覆盖（复用现有 superseded 字段）。
- 衰减：`constraint` 与 pinned 不衰减；其余按 importance × recency × usage 衰减（现有规则）。
- 用户可见：设置页或会话详情展示「记住了什么、来源、为什么」，支持逐条删除。

### 4.6 P2 观测与评测

- 轻量快照：`context_snapshot` 事件只存块 token 统计、丢弃条数、condensation 事件 id，不存正文。
- 会话详情面板：上下文构成（各块 token/占比）、压缩历史（触发原因、前后 token）、意图标签。
- 离线评测扩展 [eval-agent.mjs](file:///e:/code/traeWork/workBuddyForMe/scripts/eval/eval-agent.mjs)：
  - 跨轮追问：能引用上一轮约束/结论。
  - 长对话：压缩后关键数字/URL/文件名仍可引用。
  - 意图路由：标注集准确率与回退率。
  - 成本：平均 token/轮、压缩触发次数、预判压缩命中率。

## 5. 里程碑与验收

| 里程碑 | 交付 | 验收 |
|---|---|---|
| M0 契约冻结 | `TurnIntent`、`ContextPlan`、`context_condensed` / `context_snapshot` schema 与事件契约 | schema 单测、事件契约测试、旧数据兼容 |
| M1 意图路由 | 规则 + 可选小模型；意图标签落库 | 标注集 ≥ 80%；超时/未配置时 100% 回退不报错 |
| M2 混合装配 | 按意图配额与裁剪顺序 | 追问 golden 通过；块配额不超窗口 |
| M3 压缩事件化 | 事件写入、回放、预判与降级 | 压缩后关键信息保留率 ≥ 90%；可回放每次压缩 |
| M4 记忆治理 | 记住/忘掉、冲突标注、晋升审计 | 误删可恢复；冲突不丢信息 |
| M5 观测与评测 | 面板 + 指标门禁 | 基线对比报告；token/轮下降可量化 |

## 6. 风险与取舍

| 风险 | 应对 |
|---|---|
| 意图误判导致漏检索 | 意图只加资源不减资源；低置信度走默认策略 |
| 预判压缩增加模型调用 | 仅 85% 高水位触发，设置项可关，记录命中率 |
| 事件日志增长 | 复用 180 天保留；快照只存统计；condensation 载荷小 |
| 两套装配逻辑继续分叉 | 本版抽 `ContextPlan` 纯函数；v4.9 直接复用，不再写第二套 |
| 小模型质量不稳定 | 规则兜底 + 超时降级 + 结果可回退 |
| 记忆误删 | 软删 + 审计 + 二次确认 |

## 7. 与 v4.9 的边界

- v4.8：对话侧完成「意图 → 策略 → 装配 → 压缩事件 → 记忆治理」闭环，任务侧保持 v4.7 现状。
- v4.9：把对话侧 `ContextPlan` 与任务侧上下文注入收敛为统一 `ContextController`，共享压缩器、记忆规则与快照结构。
- 本版不做数据迁移式统一；新事件与纯函数接口即为 v4.9 的接入点。

## 8. 决策点（待拍板）

| 编号 | 决策 | 选项 | 取舍 | 建议 |
|---|---|---|---|---|
| D1 | 意图识别档位 | 纯规则 / 规则 + 小模型 / 主模型顺带判断 | 纯规则零成本但覆盖有限；小模型提升覆盖但多一次调用；主模型最准但延迟与成本最高 | 规则 + 小模型（可配），未配置时纯规则 |
| D2 | 压缩触发范围 | 仅 70% / 70% + 预判 / 再加话题切换 | 预判减少撞墙但多一次摘要调用；话题切换收益未验证 | 70% + 预判（85% 高水位）+ 用户显式；话题切换只记信号 |
| D3 | 「记住 / 忘掉」 | 一等意图 / 仅抽取器 | 一等意图可解释但需防误删；抽取器零交互但不可控 | 一等意图，删除需确认 |
| D4 | 事件粒度 | 只记压缩 / 压缩 + 轻量快照 | 只记压缩最省；快照利于回放与评测 | 压缩 + 只存 token 统计的快照 |
| D5 | `ContextPlan` 抽取时机 | v4.8 先抽 / 等 v4.9 | 先抽需要小幅重构；等 v4.9 会重复实现 | v4.8 抽纯函数接口，v4.9 复用 |
| D6 | 预判压缩默认开关 | 默认开 / 默认关 | 默认开省撞墙但增加调用；默认关省成本 | 默认开，仅高水位触发，可关 |

## 9. 参考资料

- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- OpenHands Context Condenser: https://docs.openhands.dev/sdk/guides/context-condenser
- OpenHands SDK 论文（Context Window Management）: https://arxiv.org/html/2511.03690v2
- LangChain Deep Agents 上下文工程: https://www.langchain.com/blog/context-engineering-deep-agents-remember
- Letta / MemGPT 记忆分层: https://www.aiwiki.ai/wiki/letta

## 10. 实施记录（第一批）

| 里程碑 | 状态 | 落点 |
|---|---|---|
| M0 契约 | 完成 | `shared/schemas/chat/context-intelligence.ts`；`constants/chat.ts` 阈值；settings `contextPreflightCompactEnabled` |
| M1 意图路由 | 完成 | `core/chat/context/turn-intent.ts`（规则 + 可插拔分类器端口）；`turn_intent` 事件 |
| M2 混合装配 | 完成 | `core/chat/context/context-plan.ts`；`prompt.ts` 按意图覆盖 tail/middle/memory/evidence 配额 |
| M3 压缩事件化 | 完成 | `context_condensed`（threshold/preflight、降级事件）；装配前 85% 预判压缩；设置页可关 |
| M4 记忆治理 | 完成 | `core/memory/intent-memory.ts`：记住写事实、忘掉软归档（可恢复、写审计） |
| M5 观测 | 部分 | `context_snapshot` 事件 + 事件时间线标签；专用上下文构成面板待后续 |

已知边界：
- `user_explicit` / `model_change` 触发已建模但尚未接入 UI 入口。
- 意图分类器目前只提供端口与超时回退，未绑定具体小模型；默认纯规则。
- 预判压缩会增加一次摘要调用，仅历史超 85% 水位触发，可在调优中心关闭。
