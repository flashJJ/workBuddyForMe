# 模块设计：多会话对话

> 状态：已实现（Task 14/15/21/27/33）

## 职责

- 会话 CRUD（默认标题「新会话」、支持重命名、按最近消息排序）与消息持久化。
- SSE 流式对话：增量转发、中途停止、usage 落库、错误状态。
- 可选 RAG 串接（由助手绑定的知识库触发）。
- 未配置模型时空状态引导。

## 关键实现（core）

- `packages/core/src/services/conversation-service.ts`：`create(assistantId, title?)`（校验助手存在，默认标题「新会话」）、`list(assistantId?, limit?)`、`rename`、`delete`（级联删除消息）、`appendMessage`、`recentMessages`（历史窗口裁剪）、`stopMessage`、`markMessageError`。
- `packages/core/src/chat/chat-orchestrator.ts`：`createChatOrchestrator(deps).streamChat(input)` 异步生成器，产出 `OrchestratorEvent`。
- `packages/core/src/chat/prompt.ts`：`buildChatMessages`（系统提示词 + RAG 上下文注入 + `HISTORY_MESSAGE_LIMIT` 历史裁剪）。
- `packages/core/src/chat/model-resolver.ts`：`resolveChatTarget` 解析助手 → 模型 → Provider 适配器。

## 流程（streamChat）

```text
取助手 → 无 conversationId 则创建会话 → 追加 user 消息与 assistant 占位（status=streaming）
→ yield meta → RAG 检索（assistant.knowledgeBaseId 存在且调用方传入 retrieve 时）→ 有引用 yield citations
→ 历史裁剪组装 → provider.chatStream 逐 chunk yield delta 并累积 full
→ 上游结束：写回 full/usage、消息置 completed、yield done
```

## SSE 事件（packages/shared/src/api/sse.ts）

`POST /api/chat/stream`，`formatSse` 序列化为 `event: x\ndata: {json}\n\n`。

| event | data | 时机 |
|---|---|---|
| meta | `{ messageId, conversationId }` | 助手消息占位创建（新会话在此回传 conversationId） |
| delta | `{ content }` | 每个上游增量块 |
| citations | `{ citations }` | RAG 命中时（Citation：documentName/ordinal/分数等） |
| done | `{ content, usage }` | 正常结束并落库（usage 含 prompt/completion/total tokens） |
| error | `{ code, message }` | 失败（消息置 error，持久化 errorCode/errorMessage） |

## 中断与资源释放

`request.signal`（Route Handler）→ AbortController → provider fetch signal；abort 后 `stopMessage(full)` 把已生成内容写回（消息置 `stopped`，不丢内容）并返回 `done`。消息状态枚举见 `MESSAGE_STATUSES`（streaming/completed/error/stopped）。

## 前端拆分（apps/web/src/features/chat/）

ChatPage（装配） / ConversationSidebar（列表+重命名+删除） / MessageList / MessageItem（Markdown+引用角标） / Composer / StopButton / EmptyGuide（未配置模型引导）；状态 hook `use-chat-session.ts`（历史来自 React Query，流式期间本地 live 列表接管）、`use-chat-stream.ts`（fetch SSE 解析与 abort）。
