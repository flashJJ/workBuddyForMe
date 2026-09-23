---
title: "ContentPart 联合类型实战：如何不破坏存量就扩展 ChatMessage"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B02"
tags: ["workbuddy", "typescript", "multimodal", "refactor"]
date: "2025-Q4"
---

## 问题：把 ChatMessage.content 从 string 改成 string | ChatContentPart[]，不能直接做

v0.2 时代，`ChatMessage.content` 是一个纯 `string`。世界很简单——用户发消息传一段文字，模型回复也是一段文字，存进 SQLite 是 `TEXT` 列。

v0.3 要加图片。直觉上的做法是：

```typescript
// ❌ 第一版想法（后来被证明不对）
interface ChatMessage {
  content: string | ChatContentPart[];
}
```

这个签名看上去干净，但**一落地就炸**：

1. **数据库迁移要全量回填**：v0.2 所有存量消息的 `content` 是纯文本，现在要全部包成 `[{type: 'text', text: ...}]`，不然 `JSON.parse` 解析老数据会失败。
2. **下游 consumer 要加 if/else**：对话历史排序、token 估算、前端渲染、RAG 拼接——所有读 `message.content` 的地方都要判断是 string 还是 array。
3. **序列化复杂度陡增**：SQLite 的 JSON 存储方式从 `TEXT` 变成 `JSON`，ORM 层（better-sqlite3 + 手写 mapper）所有 row → domain 的映射都要改。

所以我们选了**两字段设计**。这篇就讲这个设计的来龙去脉和真实实现。

---

## 设计决策：保留 `content` + 新增 `contentParts`

### 类型定义

`packages/shared/src/types/content-part.ts`：

```typescript
/**
 * v0.3 多模态消息内容片段（持久化形态）。
 *
 * 设计约定：
 * - 纯文本老消息 content_parts 为 []，完全回落 Message.content，不做数据回填；
 * - 图片片段只持有 attachments.id，**绝不内联 base64 落库**；
 *   core 编排器在下发模型前才解析为 data URL；
 * - 片段顺序即展示/下发顺序，文本与图片可交错。
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  attachmentId: string;
}

export type ContentPart = TextContentPart | ImageContentPart;
```

`packages/shared/src/types/domain.ts` 里的 `Message` 接口：

```typescript
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;                    // 永远有值；纯文本消息就是正文
  contentParts: ContentPart[];       // v0.3 新增；空数组 = 纯文本回落 content
  // ... 其他字段
}
```

### 为什么这样设计

**决策 1：content 永远保留 string**

`content` 的语义是「这条消息的纯文本摘要/正文」。对于纯文本消息，它就是正文本身。对于图片消息，`content` 是用户输入的文字部分（如果用户只发图不写字，`content` 就是空字符串）。这样所有**不关心多模态**的下游消费者——比如 token 估算、搜索、对话导出——都可以继续读 `message.content`，完全不用改。

**决策 2：contentParts 为空数组表示「回落 content」**

```typescript
// packages/core/src/chat/multimodal.ts
export function toAiContent(
  message: Message,
  images: Map<string, ResolvedImage>,
): string | ChatContentPart[] {
  if (message.contentParts.length === 0) return message.content;  // ← 关键回落
  return message.contentParts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const image = images.get(part.attachmentId);
    if (!image) throw new Error(`图片附件数据缺失：${part.attachmentId}`);
    return { type: 'image_url', image_url: { url: toImageDataUrl(image), detail: 'auto' } };
  });
}
```

这个函数是模型 wire 的最后一步。`contentParts.length === 0` 直接返回 `string`——这样历史纯文本消息**完全不需要处理**，直接走 v0.2 的 string wire 路径，不浪费任何处理开销。

**决策 3：ImageContentPart 只存 attachmentId，不存 base64**

这是一个至关重要的约束。`contentParts` 是要落库的（存到 `messages.content_parts` JSON 列里），如果这里存 base64，消息表一下就能从几 KB 膨胀到几十 MB。图片的二进制数据**永远只存文件系统**，`contentParts` 只是引用。

---

## 数据库层：v003-multimodal 迁移

`packages/database/src/migrations/v003-multimodal.ts`：

```typescript
// 只加列，不改数据
db.exec(`ALTER TABLE messages ADD COLUMN content_parts TEXT DEFAULT '[]' NOT NULL`);
db.exec(`ALTER TABLE attachments ADD COLUMN content_hash TEXT`);
db.exec(`ALTER TABLE documents ADD COLUMN source TEXT DEFAULT 'upload' NOT NULL`);
db.exec(`ALTER TABLE documents ADD COLUMN source_url TEXT`);
```

**没有 UPDATE 语句**。存量消息的 `content_parts` 就是 `'[]'`（默认值），完全匹配我们的回落约定。

Row → Domain 映射（`packages/database/src/repositories/mappers.ts`）：

```typescript
function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    contentParts: row.content_parts
      ? (JSON.parse(row.content_parts) as ContentPart[])
      : [],                        // ← null/空安全回落
    createdAt: row.created_at,
    // ...
  };
}
```

`JSON.parse` 包裹了一层空安全，防止旧版本数据库没有 `content_parts` 列时崩掉。

---

## 写入路径：`buildUserParts` 和 `appendMessage`

新消息写入时，`ConversationService.appendMessage` 同时接收 `content`（纯文本）和 `contentParts`（多模态片段）：

```typescript
// 调用位置：packages/core/src/chat/turn-preparation.ts
conversations.appendMessage({
  conversationId,
  role: 'user',
  content: userContent,                                          // 纯文本
  contentParts: buildUserParts(userContent, userImageIds),       // 多模态片段
});
```

`buildUserParts` 的逻辑（`multimodal.ts`）：

```typescript
export function buildUserParts(text: string, attachmentIds: string[]): ContentPart[] {
  const parts: ContentPart[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const attachmentId of attachmentIds) parts.push({ type: 'image', attachmentId });
  return parts;
}
```

纯文本消息（`attachmentIds` 为空数组）→ `parts` 就是 `[{type: 'text', text}]`——虽然 `content` 已经有纯文本了，但 parts 里也放一份。这样渲染层可以直接遍历 `contentParts`，不用再判断。

只有图片没有文字 → `parts` 是 `[{type: 'image', attachmentId: 'xxx'}]`，`content` 是空字符串。

---

## 几个容易写错的边界 case

### case 1：多轮对话历史中混合了老消息和新消息

```typescript
// packages/core/src/chat/multimodal.ts
export function collectImageIds(messages: Message[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.contentParts) {       // 老消息 contentParts = []，for 循环直接跳过
      if (part.type === 'image' && !ids.includes(part.attachmentId)) ids.push(part.attachmentId);
    }
  }
  return ids;
}
```

`collectImageIds` 遍历历史消息收集所有图片 attachmentId。v0.2 的老消息 `contentParts` 是 `[]`，for 循环自然跳过，不需要特判。

### case 2：重生成（regenerate）保留原图片

```typescript
// turn-preparation.ts regenerate 分支
const prepared = conversations.prepareRegenerate(conversationId);
userContent = prepared.content;
userImageIds = imageIdsOfParts(prepared.contentParts);
```

重生成从数据库里把原来的 `contentParts` 读出来，提取图片 attachmentId 重新过一轮门控。这里不能只用 `prepared.content`，因为 regenerate 的图片不在当前请求里。

### case 3：图片附件数据损坏

```typescript
// multimodal.ts toAiContent
const image = images.get(part.attachmentId);
if (!image) throw new Error(`图片附件数据缺失：${part.attachmentId}`);
```

如果 `contentParts` 里引用的 attachmentId 在文件系统里找不到了（用户手动删了文件、或者清理脚本清了但 DB 没同步），编排器**直接抛错**而不是静默丢图。静默丢图会导致模型回答出现「我应该看到一张图但它没了」的幻觉。

---

## 为什么不直接用 discriminated union 做序列化？

`ContentPart` 用 `type` 字段做 discriminated union，这在 TypeScript 类型收窄里是标准写法：

```typescript
function renderPart(part: ContentPart) {
  switch (part.type) {
    case 'text':   return <p>{part.text}</p>;
    case 'image':  return <img src={`/api/attachments/${part.attachmentId}`} />;
    // default 永远不会命中 —— TS 会验证 union 是否穷尽
  }
}
```

这个 switch 穷尽检查（exhaustiveness check）能保证以后加新 part 类型（比如 `audio`）时，所有消费端都会编译报错——TypeScript 是静态帮我们兜住的。这也是我们坚持用 `type` literal 做判别字段、而不是用 class 或者 duck typing 的原因。

---

## 小结

ContentPart 的设计哲学可以浓缩为三句话：

1. **存量零成本**：`content` 保持 string，`contentParts` 为空数组时自动回落；不做全量数据迁移。
2. **图片只引用不内联**：`ImageContentPart` 只存 `attachmentId`，不碰二进制，不上 base64 落库。
3. **下游渐进适配**：纯文本 consumer 继续读 `content`，多模态 consumer 读 `contentParts`——两边互不干扰。

这个设计在落地前讨论了三天：从「直接改 content 类型」→「两个字段」→「是否需要回填存量」→「ImageContentPart 要不要带 mimeType」，最终版本是最小改动 + 最清晰约束的折中。后续任何扩展（audio、video、structured_table）都只要加一个 `XxxContentPart` 接口并更新 union，数据库加默认值列，然后下游 switch 穷尽检查就会自动报错提醒你适配——这是类型系统给我们的最大恩惠。

下一篇 B03 会讲视觉编排的三道门——`assertVisionCapable`、附件存在性校验、SSE 流打开时机。那三道门全是踩过坑之后才加上的。
