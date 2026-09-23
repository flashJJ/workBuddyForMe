---
title: "从 v0.1 到 v0.2 的架构债盘点：哪些可以还、哪些留给 v0.3"
series: "WorkBuddy For Me v0.2 技术拆解"
number: "B10"
tags: ["architecture", "refactoring", "roadmap"]
date: "2025-Q4"
---

# 架构债盘点

## 为什么需要架构债盘点

"架构债"这个词由 Martin Fowler 在 2003 年提出——类似金融债，你借的是"现在不还钱，但以后要还利息"。v0.1 到 v0.2 这一年多里，WorkBuddy For Me 积累了不少架构债：有的是 v0.1 设计时就预留的扩展点但一直没实现，有的是 v0.2 开发期间为了快速交付做的临时方案，有的是外部依赖的升级跟不上导致的类型摩擦。

这篇盘点的价值不在于"承认我们代码写得不好"，而在于**诚实、系统地记录下哪些债可以还、哪些应该还、哪些暂时不还**——避免下次又在同一个坑里掉下去。盘点的粒度是 v0.2 的核心模块（chat、tools、ai adapter、database），每条债都标注了"优先级"（P0=影响稳定性，P1=影响可维护性，P2=影响体验/未来扩展）和"建议还债窗口"（v0.2.x / v0.3 / 暂不还）。

## 先看一张总图

```
                    ┌──────────────────────────────┐
                    │   v0.2 新增/改动的模块        │
                    │                              │
  tool-runtime ────▶│   chat-orchestrator         │◀──── tool-runner (带降级)
  tool-executor ───▶│      │                       │◀──── LangSmith traceAsync
  ssrf-guard ──────▶│      │                      │
                    │      ▼                       │
                    │   provider (openAI/ollama)  │
                    │      │                       │
                    │      ▼                       │
                    │   SSE stream                │
                    └──────────────────────────────┘
                         ▲           ▲           ▲
                    v0.2 能还的债    v0.3 应还的债   暂不还的债
```

## 模块逐个盘点

### 1. Chat Orchestrator：核心工具链编排器

**债 A：outgoing 消息数组的隐式共享**

chat-orchestrator 里，`outgoing: ChatMessage[]` 在多个 async generator 之间传递——`runProviderTurn` 读取它拼模型输入，工具执行完后往里面 append tool 结果，下一轮 `runProviderTurn` 再读。这个数组是 orchestrator 函数内部的局部变量，但如果未来要并行跑多个工具（v0.3 可能的优化），共享数组的 append 操作需要加锁或改成不可变更新。

- 优先级：**P2**（v0.2 不并行跑工具，当前安全；v0.3 做并行时必须解决）
- 建议窗口：v0.3
- 还法：把 `outgoing.push(...)` 改成 `outgoing = [...outgoing, newMsg]`，用不可变更新代替可变数组。当前串行场景下性能差异可忽略（每轮消息数量很少）。

**债 B：MAX_TOOL_ROUNDS 硬编码**

```typescript
for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
```

`MAX_TOOL_ROUNDS` 是 shared 包里的常量，目前是 8。但这个值不应该写死——不同场景需求不同（写代码可能需要 20 轮，简单问答 2 轮就够），而且模型能力不同也影响最优值。

- 优先级：**P2**（不影响 v0.2 功能，但限制未来灵活性）
- 建议窗口：v0.2.x（小版本就能做，改动很小）
- 还法：把 MAX_TOOL_ROUNDS 变成 assistant 配置里的可选字段，默认 8。orchestrator 从 assistant 配置里读。

**债 C：round limit fallback 文本硬编码**

```typescript
const ROUND_LIMIT_FALLBACK = '工具调用已达上限，以下是综合已有信息的回答';
```

和债 B 类似——这个 fallback 文本如果要国际化（i18n）或根据助手类型定制（比如编程助手说"我已经查了够多了，开始写代码"），需要走 i18n key 而不是硬编码中文字符串。

- 优先级：**P1**（影响可维护性和未来国际化）
- 建议窗口：v0.3（和 i18n 一起做）
- 还法：建一个 `messages/errors.ts` 集中管理所有面向用户的文本，用 `t('chat.toolRoundLimitFallback')` 替代硬编码。

### 2. Tools Runtime & Executor

**债 D：ALL_TOOLS 注册表硬编码**

```typescript
const ALL_TOOLS: Record<ToolName, Tool> = {
  current_time: currentTimeTool,
  knowledge_search: knowledgeSearchTool,
  fetch_webpage: fetchWebpageTool,
};
```

添加新工具需要改这个 Record 的字面量。更灵活的做法是让每个工具模块自己 export 一个 `register(registry)` 函数，runtime 遍历 import.meta.glob 自动注册。

- 优先级：**P2**（当前只有 3 个工具，手动注册够了；工具多起来后自动化能减少漏加的风险）
- 建议窗口：v0.3（当工具数量 ≥5 个时触发）
- 还法：每个工具模块加一个 `export const tool: Tool = {...}`，runtime 用 `import.meta.glob('./*.ts', { eager: true })` 扫描注册。注意要排除 test 文件。

**债 E：工具执行超时与 abort 信号的耦合**

```typescript
const timeoutSignal = AbortSignal.timeout(timeoutMs);
const signal = ctx.signal
  ? AbortSignal.any([ctx.signal, timeoutSignal])
  : timeoutSignal;
const result = await tool.run(rawArgs, { ...ctx, signal });
```

`executeToolCall` 把超时信号和 ctx.signal 合并后传给 tool.run，tool 内部如果用 fetch（比如 fetch_webpage）会接上这个 signal。但 ctx.signal 本身可能已经是上层 AbortController 的 signal——如果用户中断了对话，这个 signal 也会传到 tool 里。

问题是：**用户中断和工具超时应该是两个不同的错误原因**。当前代码里两者都被 normalize 成 `ToolResult.ok:false`，但模型看到的 output 文本不同：

- 用户中断："用户已中断"
- 超时："执行超过 15s 超时"

这个区分已经做到了（`executeToolCall` 里用 `ctx.signal?.aborted` 判断），但 `ctx.signal` 和 `timeoutSignal` 合并后，tool 内部自己的 fetch 也会同时响应两者。如果未来工具内部需要区分"是用户中断导致我 abort 的还是超时"，当前的合并方式会让判断变复杂。

- 优先级：**P1**（当前够用，但增加复杂性）
- 建议窗口：v0.2.x（可以小改）
- 还法：给 ToolContext 加两个独立字段：`abortSignal`（用户中断）和 `timeoutSignal`（超时），工具内部需要区分时可以分别检查。executeToolCall 仍然合并传给 fetch，但原始信号保留在 ctx 里。

### 3. AI Adapter（Ollama + OpenAI 兼容）

**债 F：Ollama adapter 没有专门的 usage 字段**

Ollama 的 `/v1/chat/completions` 流式模式不返回 usage（非流式返回）。WorkBuddy For Me 当前处理方式是把 usage 设为 null，前端 UI 跳过显示。但如果要做对话成本统计（v0.3 规划的功能），usage 是必要输入。

- 优先级：**P2**（v0.2 不做成本统计，null 可接受；v0.3 做时必须解决）
- 建议窗口：v0.3
- 还法：给 Ollama 专用一个 adapter，走原生 `/api/chat` 端点（流式时返回完整 usage），而不是复用 OpenAI 兼容端点。或者在流式结束后追加一次非流式请求（但会增加一次调用）。

**债 G：Ollama 0.3 无 toolCalls + 空 content 的降级启发式不完善**

v0.2 的 `runProviderTurnWithToolFallback` 只在**明确收到 400 且错误信息含 "does not support tools"** 时降级。Ollama 0.3 不支持 tools 时，可能返回 200 但 toolCalls 为空且 content 也为空——此时编排器会误以为模型"正常结束"而不是"无声拒绝了 tools"。

- 优先级：**P0**（影响 Ollama 0.3 用户的工具调用体验；虽然 Ollama 0.4 修复了这个问题，但 0.3 还在被使用）
- 建议窗口：v0.2.x（应尽快还）
- 还法：在 `runProviderTurn` 返回后加一层检查——`outcome.toolCalls.length === 0 && outcome.content.trim() === '' && params.tools.length > 0` 时，视为"工具被静默拒绝"，自动降级重试一次。伪代码：

```typescript
if (outcome.toolCalls.length === 0 && !outcome.content.trim() && params.tools.length > 0) {
  // 模型不支持工具，自动降级重试
  return yield* runProviderTurn({ ...params, tools: [] });
}
```

**债 H：ToolCallAccumulator 只按 index 合并**

```typescript
absorb(deltas) {
  for (const delta of deltas) {
    const existing = this.calls.get(delta.index) ?? { argsBuf: '' };
    // 合并...
    this.calls.set(delta.index, existing);
  }
}
```

这个 accumulator 按 `index` 做 key。如果 OpenAI 兼容端点同时返回多个 tool_call（不同 index），它能正确分开合并。但边界情况是：**如果 stream 中途断开、重连后 index 从 0 重新开始**，accumulator 会把新的 tool_call 和旧的混在一起。

v0.2 不处理中途重连（用户中断后重新发消息即可），所以这个债不紧急。但如果未来要做"断点续流"，accumulator 需要按 callId 做 key 而不是 index。

- 优先级：**P2**
- 建议窗口：暂不还（除非 v0.4 做断点续流）
- 还法：accumulator 初始化时传一个已有的 callId 集合，absorb 时优先按 id 匹配，fallback 到 index。

### 4. Database（Message Repository）

**债 I：tool_trace 以 JSON 存在 messages 表的一列**

```sql
ALTER TABLE messages ADD COLUMN tool_trace TEXT;  -- JSON 数组
```

tool_trace 存在 messages 表的一个 JSON TEXT 列里，不是独立表。这样做的好处是读写简单——`messages.saveToolTrace(id, trace)` 就是一条 UPDATE。但坏处是：

- **没法高效查询**："哪些对话用了 fetch_webpage"需要全表扫描 + JSON 解析；
- **没法做聚合**："用户平均每次对话用几个工具"需要把每条 trace 取出来解析后再聚合；
- **JSON 大小不受控**：一条对话如果有 8 轮工具调用，trace 可能有几 KB。

- 优先级：**P1**（当前 trace 只用于展示，不需要查询；但如果 v0.3 要做对话分析，就必须规范化）
- 建议窗口：v0.3
- 还法：新建 `tool_traces` 表（`message_id, call_id, tool_name, status, duration_ms, started_at`），一个 tool_call 一行。旧 JSON 列保留为兼容字段，新对话用新表。

**债 J：prepareRegenerate 的 DELETE 没有事务保护**

```typescript
messages.deleteAssistantMessagesAfterLastUser(conversationId);
const last = messages.findLastUserMessage(conversationId);
```

两条 SQL 顺序执行但没有事务。如果 SQLite 在 DELETE 后、SELECT 前崩溃（虽然概率极低），可能出现"助手消息删了但找不到用户消息"的中间态。

- 优先级：**P2**（SQLite 单文件数据库 + WAL 模式，这种中间态几乎不可能发生；加事务只是更严谨）
- 建议窗口：暂不还
- 还法：`db.transaction((tx) => { tx.delete...; tx.select... })()`。SQLite 的 WAL 模式下事务开销很小。

### 5. 前端（SSE 消费 + UI）

**债 K：useChatStream 的 abort 管理分散**

前端 abort 逻辑分散在 `useChatSession`（abort 上一个流再发新请求）和 `useChatStream`（SSE reader 的 abort）两个 hook 里。如果用户同时打开多个会话窗口，每个窗口各自维护一个 AbortController，abort 信号不会跨会话联动。

v0.2 里这不是问题——单窗口场景下 abort 逻辑正确。但如果 v0.3 支持多窗口，abort 管理需要中心化。

- 优先级：**P2**
- 建议窗口：v0.3（多窗口功能一起做）
- 还法：建一个全局 `StreamManager`，每个流注册自己的 controller，新流注册时自动 abort 同 conversationId 的旧流。

### 6. LangSmith 追踪层

**债 L：DirectTrace 每 span 发两次 HTTP（POST + PATCH）**

一次完整对话（chat-turn → knowledge_search → 3 个工具 → 最终回答）可能有 6-7 个 span，每个 span 发 2 次 HTTP = 12-14 次请求。这在本地开发场景没问题（都是 localhost 或内网 LangSmith），但如果 LangSmith endpoint 在公网（`https://api.smith.langchain.com`），12 次请求可能要 1-2 秒。

- 优先级：**P1**（影响开启追踪时的延迟，但 v0.2 已经 5 秒超时 + 静默吞异常，不会阻塞主链路）
- 建议窗口：v0.3
- 还法：**Batch + 后台 flush**。把 DirectTrace 改成"start 时只攒到队列里，每 100ms 批量 POST 一次"，end 时 PATCH 也攒批。关闭追踪时代码路径完全不变（队列不被创建）。

### 不打算还的债：刻意的技术选择

最后列几个**我们知道它是债但不打算还**的——因为这是"本地优先、个人/小团队用"这个产品定位下的最优选择：

| 债 | 为什么不还 |
|----|-----------|
| Ollama adapter 复用 OpenAI 兼容端点（没有原生 `/api/chat` adapter） | 减少维护面。用户不做成本统计，流式 usage 缺失可接受 |
| 所有工具只读（没有文件系统/命令执行） | 安全边界明确。未来加工具时再逐个评估 |
| SQLite 单文件 + sqlite-vec | 个人/小团队数据量（<100k 条）下够快，分布式数据库引入过重 |
| `ToolResult.output` 是纯文本 | 结构化输出（JSON）会让工具链更灵活，但增加模型 prompt 复杂度 |
| langsmith SDK 没有引入，自己写了 trace client | SDK 200KB+ 重依赖，WorkBuddy For Me 只用了 startRun/end 两个 API |

这些是 v0.1 到 v0.2 整个过程中**被反复讨论、最终明确选择**的架构决定，不是疏忽的遗漏。写在这里不是为了"承认债"，而是为了**未来重新评估时有据可查**——如果用户规模超过 100k 条、或有人明确需要本地 shell 工具，这些选择需要被 revisit。

## 总结：还债节奏

```
v0.2.x 小版本还债（1-2 周内可完成）：
  ├── 债 G: Ollama 0.3 静默降级启发式（P0，影响稳定性）
  ├── 债 B: MAX_TOOL_ROUNDS 变成 assistant 可配置（P2）
  └── 债 E: ToolContext 保留原始 abortSignal 与 timeoutSignal（P1）

v0.3 还债（下一个大版本周期）：
  ├── 债 F: Ollama 原生 /api/chat adapter（需要 usage）
  ├── 债 I: tool_trace 独立表（需要查询/聚合）
  ├── 债 A: outgoing 不可变更新（并行工具链前置条件）
  ├── 债 D: 工具自动注册（工具数量 ≥5 触发）
  ├── 债 C: 面向用户文本 i18n（国际化前置）
  ├── 债 K: 全局 StreamManager（多窗口前置）
  └── 债 L: trace 批量 flush（性能优化）

暂不还：
  ├── 债 H: ToolCallAccumulator 按 index（无断点续流需求）
  ├── 债 J: prepareRegenerate 事务保护（SQLite WAL 已足够）
  └── 刻意的技术选择（见上表）
```

架构债盘点的核心不是"还清所有债"，而是**对每一笔债都有清晰的优先级和还债窗口**。WorkBuddy For Me 的架构从 v0.1 到 v0.2 保持了健康的演进——没有引入无法维护的技术债务，大部分债都是"知道可以更好但暂时不影响功能"的温和债。这归功于三层工程门禁（TS strict + 300 行 + 外部调用 mock）守住了代码质量的底线。

## 本系列到此结束

B01-B10 覆盖了 WorkBuddy For Me v0.2 从架构升级、工具调用完整实现、SSE 事件编排、Ollama 集成、冷启动优化、LangSmith 追踪零侵入、消息重生成并发安全、SSRF 安全红线、工程约束三层门禁到架构债盘点的完整技术故事。如果从第一篇开始一路读到这里，你应该能理解：**v0.2 不是一个孤立的功能迭代，而是一次系统性的升级——把 WorkBuddy For Me 从"只会说"的 RAG 问答助手，变成了"会动手"的本地优先 Agent 平台的第一块基石**。

v0.3 的规划是多模态（图片输入已经在 v0.2 底层搭好了）、富文档（Markdown/LaTeX 渲染）、对话成本统计、以及更丰富的工具集。届时我们再写 v0.3 的系列。
