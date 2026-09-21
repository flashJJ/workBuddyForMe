# 模块设计：多会话对话

> 状态：已实现（Task 14/15/21/27/33，v0.2 工具调用/重新生成）

## 职责

- 会话 CRUD（默认标题「新会话」、支持重命名、按最近消息排序）与消息持久化。
- SSE 流式对话：增量转发、中途停止、usage 落库、错误状态。
- v0.2：多轮 Tool Calling（current_time / knowledge_search / fetch_webpage）、重新生成。
- 可选 RAG 串接（助手 `retrieveAlways=true` 且绑定知识库时每轮强制检索；否则改由模型通过 knowledge_search 工具按需检索）。
- 未配置模型时空状态引导。

## 关键实现（core）

- `packages/core/src/services/conversation-service.ts`：`create(assistantId, title?)`（校验助手存在，默认标题「新会话」）、`list(assistantId?, limit?)`、`rename`、`delete`（级联删除消息）、`appendMessage`、`recentMessages`（历史窗口裁剪）、`stopMessage`、`markMessageError`、`prepareRegenerate(id)`（取最后一条 user 消息并删除其后所有消息）、`saveMessageToolTrace`。
- `packages/core/src/chat/chat-orchestrator.ts`：`createChatOrchestrator(deps).streamChat(input)` 异步生成器，产出 `OrchestratorEvent`；内含工具调用循环。
- `packages/core/src/tools/`：`tool-runtime.ts`（`createToolRuntime` 按助手 `enabledTools` 构造工具实例）、三工具（current-time / knowledge-search / fetch-webpage）、`tool-executor.ts`（参数解析 + 超时 + 统一 `ToolResult`）、`ssrf-guard.ts`（私网/保留地址拦截，见下）。
- `packages/ai/src/…`：`runProviderTurn` 把上游流折叠成 `delta | toolCalls` 步骤；`ToolCallAccumulator` 处理分片 tool_calls delta。
- `packages/core/src/chat/prompt.ts`：`buildChatMessages`（系统提示词 + RAG 上下文注入 + `HISTORY_MESSAGE_LIMIT` 历史裁剪）。
- `packages/core/src/chat/model-resolver.ts`：`resolveChatTarget` 解析助手 → 模型 → Provider 适配器。

## 流程（streamChat）

```text
取助手
├ regenerate=true：prepareRegenerate(conversationId) 取最后 user 消息（不新增用户消息）
└ 普通：无 conversationId 则创建会话，追加 user 消息
→ 追加 assistant 占位（status=streaming）→ yield meta
→ buildTools(assistant, provider.supportsTools) → 下发 tools 定义
→ 老 RAG：input.retrieve && assistant.knowledgeBaseId && assistant.retrieveAlways
→ 工具循环（最多 MAX_TOOL_ROUNDS=5 轮）：
    runProviderTurn → delta 全部透传并累积；tool_calls 逐个：
      yield tool(start) → executeCall（超时 TOOL_TIMEOUT_MS=15s）→ yield tool(end)
      tool 结果以 {role:'tool'} 回灌，未知工具名归一 ok:false 文本
    citations 跨轮累积去重（key=documentId:ordinal）
→ 上游不再要求调工具 / 轮次用尽（给兜底文案）→ 写回 full/usage/toolTrace、completed、yield done
```

## SSE 事件（packages/shared/src/api/sse.ts）

`POST /api/chat/stream`，`formatSse` 序列化为 `event: x\ndata: {json}\n\n`。

| event | data | 时机 |
|---|---|---|
| meta | `{ messageId, conversationId }` | 助手消息占位创建（新会话在此回传 conversationId） |
| delta | `{ content }` | 每个上游增量块 |
| tool | `{ phase:'start'\|'end', callId, tool, argsSummary?, status?, durationMs?, resultSummary?, error? }` | 每次工具调用前后（running 态不落库，end 摘要写入 messages.tool_trace） |
| citations | `{ citations }` | RAG 或 knowledge_search 命中时，跨轮累积去重 |
| done | `{ content, usage }` | 正常结束并落库（usage 含 prompt/completion/total tokens） |
| error | `{ code, message }` | 失败（消息置 error，持久化 errorCode/errorMessage） |

## SSRF 防护（fetch_webpage）

- 抓取前对 URL 的每个重定向目标（最多 3 跳）逐跳执行 `resolveAndAssertHost`：DNS 解析后校验全部 A/AAAA 地址。
- 拦截私网/环回/链路本地/保留段，IPv4-mapped IPv6 解包后按 IPv4 规则判定；仅允许 http/https。
- 抓取超时 8s、响应体上限 200KB，正文经 htmlToText 裁剪后回灌。

## 中断与资源释放

`request.signal`（Route Handler）→ AbortController → provider fetch signal；循环内手动迭代 `runProviderTurn` 生成器（保证 abort 时本轮已产出的 delta 不丢）。abort 后 `stopMessage(full)` 把已生成内容写回（消息置 `stopped`，不丢内容）、保存当前 toolTrace 并返回。消息状态枚举见 `MESSAGE_STATUSES`（streaming/completed/error/stopped）。

## 重新生成与编辑重发

- 重新生成：前端删除尾部助手乐观消息，请求体带 `regenerate:true`（content 沿用最后一条用户消息）；服务端 `prepareRegenerate` 校验后重答，消息总数不变。
- 编辑重发：普通新回合，携带编辑后的内容作为新 user 消息。

## 前端拆分（apps/web/src/features/chat/）

ChatPage（装配） / ConversationSidebar（列表+重命名+删除） / MessageList / MessageItem（Markdown+引用角标+ToolTrace 过程卡片；user 消息内联「编辑并重发」，最后一条 assistant 消息可「重新生成」） / ToolTrace（`tool-trace.tsx`，running 转圈/成功/失败、耗时、可展开） / Composer / StopButton / EmptyGuide（未配置模型引导）；状态 hook `use-chat-session.ts`（历史来自 React Query，流式期间本地 live 列表接管，onTool upsert 维护 trace）、`use-chat-stream.ts`（fetch SSE 解析、abort、regenerate）。
