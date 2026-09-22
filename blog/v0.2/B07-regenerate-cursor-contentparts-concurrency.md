---
title: "消息重生成的正确姿势：cursor 回溯、contentParts 保留、并发安全"
series: "WorkBuddy v0.2 技术拆解"
number: "B07"
tags: ["chat", "regenerate", "concurrency"]
date: "2025-Q4"
---

# 消息重生成的正确姿势

## 重生成是什么

"重生成"是聊天应用里一个基础但容易做错的功能：用户点助手消息旁边的"重新生成"按钮，**删除这条助手消息（及其后面所有内容），用同一条用户输入重新调一次模型**。

听起来很简单，但里面藏着三个容易踩的坑：

1. **什么时候删**：如果用户点重生成时上一条 assistant 消息还在 streaming（status='streaming'），直接删可能导致竞态——旧流还在写数据库，新流已经开始了。
2. **删到哪里**：多轮对话场景下，用户可能在"重新生成"后又追加了新消息——应该只删除"最后一条用户消息之后的所有助手消息"，而不是整条会话历史。
3. **图片/多模态片段**：v0.2 开始支持图片输入（contentParts），重生成时需要**原封不动地保留用户那条消息的 contentParts**，不能只拷文本。

## v0.1 的做法：直接在前端重置

v0.1 的重生成逻辑很 naive——前端发一个 `regenerate=true` 的聊天请求，后端看到 regenerate 就**从数据库重新拼整条对话历史（去掉最后一条 assistant 消息）**，然后正常调用模型。这种做法有几个问题：

1. **删除时机晚**：直到新流开始了才删旧消息，前端 UI 上会短暂出现"旧消息还在 → 突然消失 → 新消息开始出现"的闪烁。
2. **历史过滤逻辑分散**：数据库层、服务层、编排器层各有一份"怎么过滤历史"的代码，很容易出现不一致。
3. **不处理流式中的重生成**：用户在 assistant 消息还在 streaming 时点重生成，旧流会继续往数据库写内容，新流又开始写，两条流同时写同一个 conversation 会导致历史混乱。

## v0.2 的设计：prepareRegenerate 前置清理

v0.2 把重生成逻辑收敛到了**ConversationService.prepareRegenerate** 一个入口（`packages/core/src/services/conversation-service.ts`）：

```typescript
prepareRegenerate(conversationId: string): { content: string; contentParts: ContentPart[] } {
  requireConversation(conversationId);
  // 第一步：删除最后一条用户消息之后的所有助手消息（幂等）
  messages.deleteAssistantMessagesAfterLastUser(conversationId);
  // 第二步：取最后一条用户消息的完整内容（含 contentParts）
  const last = messages.findLastUserMessage(conversationId);
  if (!last) throw ApiError.validation('没有可重新生成的用户消息');
  return { content: last.content, contentParts: last.contentParts };
}
```

两个数据库操作（`deleteAssistantMessagesAfterLastUser` 和 `findLastUserMessage`）在 `MessageRepository` 层实现（`packages/database/src/repositories/message-repo.ts`）：

```typescript
deleteAssistantMessagesAfterLastUser(conversationId: string): number {
  // 先找到最后一条用户消息的 rowid
  const lastUser = db.prepare(
    `SELECT rowid AS rowid FROM messages
       WHERE conversation_id = ? AND role = 'user'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
  ).get(conversationId) as { rowid: number } | undefined;
  if (!lastUser) return 0;

  // 删除该 rowid 之后的所有助手消息
  const info = db.prepare(
    `DELETE FROM messages
       WHERE conversation_id = ? AND role = 'assistant' AND rowid > ?`
  ).run(conversationId, lastUser.rowid);
  return info.changes;
}

findLastUserMessage(conversationId: string): Message | null {
  const row = db.prepare(
    `SELECT * FROM messages
       WHERE conversation_id = ? AND role = 'user'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
  ).get(conversationId);
  return row ? mapMessage(row) : null;
}
```

核心思想是**用 rowid（SQLite 内置自增行号）来做"截断点"**：找到最后一条 user 消息的 rowid，然后删除所有 role='assistant' 且 rowid > lastUser.rowid 的记录。这样做有两个好处：

- **幂等**：已经没有尾随助手消息时，DELETE 的影响行数是 0，不报错。
- **原子**：两个 SQL 在同一个 db 实例上顺序执行，不会出现"删了一半查 lastUserMessage"的中间态。

## 并发安全：流式中的重生成

最棘手的情况是：用户发送消息后，assistant 消息正在 streaming（`status='streaming'`），此时用户点了"重新生成"按钮。这条 streaming 消息在数据库里已经创建了占位记录（`status='streaming'`，`content=''`），正在被异步的 `chat-orchestrator.streamChat` 持续更新。

v0.2 的处理流程（前端和后端协作）：

### 前端侧

前端在发起新的流请求前，**先 abort 上一个流**：

```typescript
// useChatSession.ts（简化）
let currentStreamAbortController: AbortController | null = null;

async function regenerate(conversationId: string) {
  // 1. 立即 abort 上一个流
  if (currentStreamAbortController) {
    currentStreamAbortController.abort();
    currentStreamAbortController = null;
  }

  // 2. 创建新的 AbortController
  const controller = new AbortController();
  currentStreamAbortController = controller;

  // 3. 发起 regenerate 请求（带 conversationId + regenerate=true）
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, regenerate: true }),
    signal: controller.signal,
  });
  // ...消费 SSE...
}
```

同时前端 UI 上**先把正在 streaming 的 assistant 消息隐藏/标记为"已取消"**，不要等后端删除。这样用户点击按钮后立即看到 UI 变化，不会有闪烁感。

### 后端侧

后端有两道保护：

**保护 1：AbortSignal 检查贯穿全链路**

chat orchestrator 的每个循环点都检查 `input.signal?.aborted`。abort 后立即：

```typescript
if (input.signal?.aborted) {
  conversations.stopMessage(assistantMessage.id, full);  // 把消息标记为 stopped，保留已产出内容
  conversations.saveMessageToolTrace(assistantMessage.id, trace);
  yield { event: 'done', data: { content: full, usage } };
  return;  // 提前退出 generator
}
```

注意 `stopMessage` 不是 `deleteMessage`——它把消息状态从 streaming 改成 stopped，保留已产出的内容。这意味着数据库里那条被 abort 的 streaming 消息仍然存在（status='stopped'），但 `prepareRegenerate` 会删除它（因为它是最后一条 user 消息之后的 assistant 消息）。

**保护 2：prepareRegenerate 在 SSE 打开前执行**

`prepareUserTurn` 函数（`packages/core/src/chat/turn-preparation.ts`）在 orchestrator 开流前同步执行：

```typescript
export function prepareUserTurn(params: {...}): PreparedTurn {
  if (input.regenerate) {
    conversationId = input.conversationId;
    conversations.get(conversationId);
    // 同步删除旧 assistant 消息
    const prepared = conversations.prepareRegenerate(conversationId);
    userContent = prepared.content;
    userImageIds = imageIdsOfParts(prepared.contentParts);
  } else {
    // 正常新建/追加 user 消息
  }
  // ...
}
```

`prepareRegenerate` 在**第一个 SSE 事件发出之前**就完成了删除。即使上一条流的 abort 信号还在传播中（网络延迟），数据库层面的清理已经先做了。

但这里有个微妙的竞态窗口：**如果上一条流的 abort 还没生效，它可能还在写数据库**。具体来说：

1. 用户点重生成 → 前端 abort 流 A → 发起流 B → 后端 B 执行 prepareRegenerate（删除 assistant 消息 A 的占位记录）
2. 流 A 的 abort 信号因为网络延迟，还没传到 server → 流 A 还在 yield delta、还在调用 `conversations.completeMessage(assistantMessageA.id, ...)`

此时流 A 试图 complete 的那条消息已经被 B 的 prepareRegenerate 删除了。`completeMessage` 在数据库层会因为找不到这条消息而静默失败（`UPDATE ... WHERE id = ?` 的影响行数为 0）——这是可以接受的，因为那条消息本来就要被删掉。

**关键洞察**：v0.2 不追求"零竞态"，追求的是"竞态不会导致数据错乱"。被删除的消息上的后续 UPDATE 操作影响行数为 0 = 相当于没执行 = 符合预期。

## contentParts：图片片段的完整保留

v0.2 开始支持多模态输入——用户可以在消息里附带图片。这些图片在数据库里以两种形式存储：

1. `content` 字段：纯文本（可能是 Markdown 占位 `![图1](attachment:xxx)` 或空字符串）；
2. `content_parts` JSON 字段：结构化的 `ContentPart[]`，例如：

```typescript
[
  { type: 'text', text: '这张图里有什么？' },
  { type: 'image', attachmentId: 'att_abc123', altText: '用户上传的截图' },
]
```

重生成时必须完整保留 `contentParts`，否则模型收不到图片信息。`prepareRegenerate` 的返回值已经包含了完整的 `contentParts`：

```typescript
return { content: last.content, contentParts: last.contentParts };
```

然后在 `prepareUserTurn` 里，重生成路径复用这些 contentParts，正常路径则通过 `buildUserParts` 从附件列表构建：

```typescript
if (input.regenerate) {
  const prepared = conversations.prepareRegenerate(conversationId);
  userContent = prepared.content;
  userImageIds = imageIdsOfParts(prepared.contentParts);  // 从 contentParts 里提取 image attachmentIds
} else {
  // 正常路径：userImageIds = input.attachments，contentParts = buildUserParts(...)
}
```

`imageIdsOfParts` 从 `ContentPart[]` 里提取所有 `type='image'` 的 `attachmentId`，这些 ID 后续会传给 `AttachmentService.requireRowsByIds` 做存在性校验、传给 `buildImageMap` 生成 data URL——整个多模态链路在重生成场景下和正常场景完全一致。

## 历史截断：两种模式

重生成后，编排器在拼历史消息时需要注意"不要把刚删掉的 assistant 消息又加回去"。但实际上不需要额外的过滤逻辑——因为：

1. `prepareRegenerate` 已经把那条 assistant 消息从数据库里删掉了；
2. `recentMessages(conversationId, n)` 从数据库取最近 n 条，自然拿不到被删除的记录。

这就是为什么"在数据库层做清理"比"在内存层做过滤"更靠谱——过滤逻辑会分散到多个地方，而数据库的 DELETE 是 source of truth。

但有一个边缘场景值得提：**用户发消息 A → assistant 回复 B（带工具调用）→ 用户点重生成 → 重生成后的 assistant 回复 C**。重生成时只删 B，不删 A。历史消息里仍然有 A（user）和 C（新 assistant）。**不会**出现 B 的 tool_call 痕迹被残留的情况——因为 tool trace 是跟 assistant message 绑定的（`messages.tool_trace` JSON 字段），assistant message 被删了，tool trace 也跟着没了。

## 小结

v0.2 的消息重生成解决了三个核心问题：

| 问题 | 解法 |
|------|------|
| 截断点不确定 | 用 SQLite rowid 做"最后一条 user 消息之后"的截断边界 |
| 并发竞态 | 前端先 abort 上一个流 + 后端 prepareRegenerate 在 SSE 打开前同步执行 + 被删除消息上的后续 UPDATE 静默失败 |
| 多模态保留 | prepareRegenerate 返回完整 contentParts，图片 attachmentId 从 contentParts 里提取 |

重生成的复杂度很大程度上来自"流式 + 多模态"两个维度的叠加。v0.2 的设计核心是**在数据库层做幂等清理**——一旦旧消息被 DELETE 了，后续所有读取历史的地方都看不到它，不需要额外的 in-memory 过滤。

B08 会转到安全话题：工具调用链的 SSRF 防护、文件系统白名单、命令执行沙箱。
