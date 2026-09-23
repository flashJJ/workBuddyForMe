---
title: "视觉对话编排：SSE 流前的三道保险"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B03"
tags: ["workbuddy", "multimodal", "orchestration", "vision", "sse"]
date: "2025-Q4"
---

## 为什么要在 SSE 打开之前做校验

流式对话的标准写法是：打开 HTTP 200 + `Content-Type: text/event-stream` → 然后开始往下推 delta。一旦流打开，客户端已经进入「等待打字机效果」状态了——此时再回一个 error 事件，用户看到的是等了 30 秒然后冒一个红叉，体验极差。

在 v0.2 里我们已经知道这个问题：**所有同步可判定的错误，必须在 SSE 打开之前抛出**。比如参数校验、模型不存在、会话不存在——这些用 4xx/5xx 直接返回，不进流。

v0.3 加视觉之后，多了两个同步可判定的风险点：
1. 用户选了纯文本模型，却发了图片 → 模型收到图片后会拒绝，返回 400
2. 用户引用了一个不存在的附件 ID → 编排器 `loadImages` 时找不到文件

如果不提前拦，这两个错误都会变成「等了 30 秒然后 error」。所以我们在 `prepareUserTurn` 里加了三道保险，**全部在 SSE 打开之前执行**。

---

## 三道保险的位置和代码

`packages/core/src/chat/turn-preparation.ts`：

```typescript
export function prepareUserTurn(params: {
  assistant: Assistant;
  input: StreamChatInput;
  target: ResolvedChatTarget;
  conversations: ConversationService;
  attachments: AttachmentService;
}): PreparedTurn {
  const { assistant, input, target, conversations, attachments } = params;

  let conversationId: string;
  let userContent: string;
  let userImageIds: string[];

  // ... 重生成 / 新建会话分支 ...

  // ======= 三道保险 =======
  assertVisionCapable(target.model, userImageIds.length);            // 保险 1：模型能力
  attachments.requireRowsByIds(userImageIds);                         // 保险 2：附件存在性

  return { conversationId, userContent, userImageIds };
}
```

`assertVisionCapable` 函数：

```typescript
function assertVisionCapable(model: ResolvedChatTarget['model'], imageCount: number): void {
  if (imageCount > 0 && !model.capabilities.includes('vision')) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `当前模型「${model.displayName}」不支持图片，请在设置中切换到视觉模型（如 qwen2.5-vl）`,
    );
  }
}
```

调用位置在 `ChatOrchestrator.streamChat` 里：

```typescript
// packages/core/src/chat/chat-orchestrator.ts
try {
  target = resolveChatTarget(deps, assistant);
  ({ conversationId, userContent } = prepareUserTurn({
    assistant, input, target, conversations, attachments,
  }));
} catch (error) {
  yield { event: 'error', data: normalizeFailure(error) };   // ← 还没开流就 catch
  return;
}

// 到这里才 append assistant message 并 yield meta——SSE 正式打开
const assistantMessage = conversations.appendMessage({ ... });
yield { event: 'meta', data: { messageId: assistantMessage.id, conversationId } };
```

**关键：`prepareUserTurn` 在 try/catch 里执行，`catch` 里直接 yield error 然后 return——不 append assistant message，不推 meta 事件，HTTP 连接也不会走到 200 SSE 路径**。但注意上面 catch 里 yield 了 error——这个 yield 是在 generator 里执行的，但此时 Route Handler 还没进入 `res.writeHead(200)`，所以客户端拿不到 SSE error 事件而是正常的 HTTP 错误响应。

---

## 保险 1：assertVisionCapable 的真实触发场景

### 场景 A：Ollama 默认选了 qwen2.5:7b（不是 VL 版本）

用户装了 Ollama，拉了 `qwen2.5:7b`（纯文本）。UI 上模型列表显示了它。用户选了这个模型作为聊天默认，然后往 composer 里拖了一张图发送。

**不做门控会发生什么**：
1. SSE 打开（200）
2. 编排器组装 messages，带 `image_url` data URL 下发
3. Ollama `/v1/chat/completions` 收到请求，发现 `image_url`，但 qwen2.5:7b 没有 vision 能力
4. Ollama 返回 400，SSE 流还没推任何 delta
5. 编排器 catch 到错误，yield error 事件
6. 用户看到「请求失败」——但等了至少 3-5 秒（Ollama 冷启动到处理完请求的时间）

**有门控**：用户点击发送 → 后端同步校验 → 422 返回 → 前端 toast 提示「当前模型不支持图片，请切换到视觉模型（如 qwen2.5-vl）」→ 用户立刻知道去哪改。

### 场景 B：assistant 绑了纯文本模型，但用户临时在设置里切换了视觉模型

这种 edge case 也被覆盖——`resolveChatTarget` 返回的就是当前请求要用的 model（assistant 默认 + 用户临时 override 的合并），`assertVisionCapable` 检查的是 resolved model 的 capabilities，不是 assistant 的静态配置。

### 为什么错误码是 VALIDATION_ERROR（422）

用户发了图片 + 选了纯文本模型，这是**用户输入的组合不合法**——参数本身没问题，但参数之间的关系不成立。所以我们用 422（Validation）而不是 400（Bad Request）或 500。

如果附件存在性校验失败（保险 2），同样是 VALIDATION_ERROR，提示里带具体缺失的 attachmentId。

---

## 保险 2：附件存在性校验

`AttachmentService.requireRowsByIds`：

```typescript
// packages/core/src/services/attachment-service.ts
requireRowsByIds(ids: string[]): AttachmentRow[] {
  const rows = repo.listRowsByIds(ids);
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = ids.find((id) => !found.has(id));
    throw ApiError.validation(`图片附件不存在或已被清理：${missing ?? ''}`);
  }
  return rows;
}
```

### 为什么需要这个校验

v0.3 里图片附件的文件落盘在 `attachments/<id>.<ext>`。但**文件系统和数据库不是强一致的**：

1. 用户手动删除了 `attachments/` 目录下的文件，但数据库行还在 → DB 查到了，文件读不到 → `readFileSync` 抛 ENOENT
2. 清理脚本 `cleanup-orphan-attachments` 先删了文件、后删 DB（或者反过来），中间有窗口
3. 多进程（Web + Desktop 的 Electron shell）同时操作时，一个进程刚存完，另一个进程就清了

我们在 `loadImages`（真正读文件的地方）里也会再查一次，但那时候 SSE 已经开了——用户已经看到 meta 事件了。提前校验能让「附件不存在」也变成 422，而不是流中途崩。

### 为什么 `requireRowsByIds` 不读文件

只查 DB 不读文件，是有意为之——读文件涉及 IO，同步阶段尽量做轻操作。文件系统的最终校验在 `loadImages` 里做（流打开之后、真正需要图片的时候）。如果那时候文件真的没了（保险 2 通过但文件不存在），错误会变成流里的 error 事件——但这种窗口极小，可以接受。

---

## 保险 3（隐式）：SSE 流打开时机

三道保险里其实有一个是**设计约束而非显式函数**：`prepareUserTurn` 执行在「还没有任何 SSE 事件发出去」之前。

时序图：

```
客户端 POST /api/chat/stream
  │
  ▼
Route Handler (apps/web/src/app/api/chat/stream/route.ts)
  │
  ├── 解析 body（同步）
  ├── resolveChatTarget（同步：查 DB）
  ├── prepareUserTurn（同步：门控 1 + 门控 2）
  │     │
  │     ├── assertVisionCapable
  │     ├── attachments.requireRowsByIds
  │     │
  │     └── 任意失败 → 抛 ApiError → Handler 返回 422 JSON
  │
  ├── append assistant message（DB 写入）
  ├── yield meta 事件（↓ 这一步开始才 writeHead 200）
  │
  └── 进入 async generator 循环
        ├── buildImageMap（读文件，可能 IO 失败）
        ├── toAiContent（组装 wire，可能 attachmentId 缺失）
        └── stream provider（可能 provider 端拒绝）
              │
              └── 这些失败 → yield error 事件
```

把同步校验和异步流式**在代码层面分开**，是 `ChatOrchestrator.streamChat` 设计里最关键的决策之一。所有门控集中在 `prepareUserTurn` 一个函数里，所有异步部分集中在 generator 里——这样未来加新门控（比如「模型配额不足」「用户请求被限流」）时，你知道应该改哪里。

---

## 为什么不在前端做校验

前端 composer 组件（`composer.tsx`）已经有「当前模型是否支持 vision」的实时检测——模型切换时会更新 UI 提示。但**前端校验永远是辅助手段**，后端必须有门控，原因有三：

1. **HTTP API 是公开的**：任何人都能 curl 直接调 API，绕过前端。
2. **状态不一致窗口**：前端可能在发送瞬间刚切换了模型，但后端 DB 还没同步。
3. **重生成路径**：regenerate 不走前端 composer 的实时检测（它从 DB 读历史 `contentParts`），只能后端兜底。

---

## 测试覆盖

`chat-orchestrator-vision.test.ts` 专门测视觉编排：

```typescript
// 保险 1：纯文本模型 + 图片 → 422
it('rejects image attachments when model lacks vision capability', async () => {
  // mock assistant 绑了 qwen2.5:7b（capabilities: []）
  const input = { attachments: ['att-1'] };
  // ... streamChat ...
  expect(result.events).toEqual([
    { event: 'error', data: { code: 'VALIDATION_ERROR', message: expect.stringContaining('不支持图片') } },
  ]);
});

// 保险 2：图片附件不存在 → 422
it('rejects when attachment row is missing', async () => {
  // attachments 表里没有 att-1 的行
  const input = { attachments: ['att-1'] };
  // ... streamChat ...
  expect(result.events[0]).toEqual({
    event: 'error',
    data: expect.objectContaining({ message: expect.stringContaining('图片附件不存在') }),
  });
});

// 正常通过：视觉模型 + 有效附件
it('proceeds when model supports vision and attachment exists', async () => {
  // 完整 happy path：meta → delta → done
});
```

---

## 小结

三道保险本质上是一句话：**所有能在 SSE 打开之前判定的错误，必须在 SSE 打开之前抛出**。

- 模型能力门控 → 防止纯文本模型收到图片请求
- 附件存在性校验 → 防止编排器 load 文件时才发现附件没了
- 设计约束：同步校验与异步流式在代码层面分开

每一道都是 v0.2 时代没踩过的坑，加了视觉之后才暴露出问题。如果你也要给已有的纯文本 RAG 加视觉，记住这三道门——以及：**门控放同步阶段，永远不要放到 generator 里**。

下一篇 B04 讲附件存储的正确姿势：为什么明文落盘、为什么 DB 不存 base64、sha256 去重是怎么工作的。
