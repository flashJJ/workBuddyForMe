---
title: "SSE 事件流里怎么塞工具过程：meta→tool_call→tool_result→delta 的时序编排与 UI 可见性"
series: "WorkBuddy v0.2 技术拆解"
number: "B03"
tags: ["sse", "streaming", "frontend"]
date: "2025-Q4"
---

# SSE 事件流里塞工具过程

## v0.1 的 SSE：纯文本管道

v0.1 的 SSE 事件序列很简单，像一个纯文本管道：

```
meta → delta → delta → delta → ... → done
                 ↓ (任何时刻可能)
                 error
```

- `meta` 只在最开始发一次，告诉前端这次对话的 `messageId` 和 `conversationId`。
- `delta` 是流式文本增量，前端一边收一边 append 到消息气泡里。
- `done` / `error` 是终止事件，连接到此结束。

这个模型的核心假设是：**助手只产出一种东西——文本**。所有"生成"发生在模型内部，前端只消费结果。但一旦引入工具调用，这个假设就破了：助手不再是一个"文本生成器"，而是一个可能多轮循环的"编排器"。中间会穿插非文本事件——工具开始执行、执行完毕、返回引用角标、工具链错误。

v0.2 的 SSE 事件序列因此变成了一棵更丰富的时序：

```
meta
  ↓
[RAG: citations?]
  ↓
←── round loop ──→
│                  ↑
│  tool(start)     │
│    ↓             │
│  (工具执行，耗时) │
│    ↓             │
│  tool(end)       │
│    ↓             │
│  [citations?]    │
│    ↓             │
│  delta...delta   │
│    ↓             │
│  (是否还有工具调用?) ── yes → 回到 tool(start)
│                  ── no  → 跳出 loop
↓
done | error
```

## SSE 事件类型定义

所有事件类型在 `packages/shared/src/api/sse.ts` 统一定义（shared 包是前后端都能 import 的纯 TS 类型层）：

```typescript
export const SSE_EVENT = {
  META: 'meta',
  DELTA: 'delta',
  CITATIONS: 'citations',
  TOOL: 'tool',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

export type SsePayloadMap = {
  meta: { messageId: string; conversationId: string };
  delta: { content: string };
  citations: { citations: Citation[] };
  tool: ToolEventPayload;
  done: { content: string; usage: TokenUsage | null };
  error: { code: string; message: string };
};

/** 序列化为 SSE wire 格式 */
export function formatSse<K extends SseEventName>(
  event: K,
  data: SsePayloadMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

`tool` 事件的 payload 是一个联合类型（`packages/shared/src/types/tool.ts`），区分 `start` 和 `end` 两个阶段：

```typescript
export type ToolCallStatus = 'running' | 'ok' | 'error';

export type ToolEventPayload =
  | {
      phase: 'start';
      callId: string;
      tool: ToolName;
      argsSummary: string;   // "查一下 https://example.com"
    }
  | {
      phase: 'end';
      callId: string;
      tool: ToolName;
      status: ToolCallStatus;     // ok | error
      durationMs: number;          // 执行耗时
      resultSummary: string;       // 结果摘要（UI 展示）
      error?: string;              // 失败原因
    };
```

注意 `callId` 字段——这是关联 start 和 end 的唯一标识。同一个工具调用的 start 和 end 一定共享同一个 `callId`，前端据此把两个事件合并成一个完整的工具卡片。

## Orchestrator 里的事件发射时机

在 `packages/core/src/chat/chat-orchestrator.ts` 里，`streamChat` 是一个 `AsyncGenerator<OrchestratorEvent>`，每个 `yield` 对应一个事件。我们来逐段看发射时机：

### 第一弹：meta

```typescript
const assistantMessage = conversations.appendMessage({
  conversationId, role: 'assistant', content: '', status: 'streaming',
});
yield { event: 'meta', data: { messageId: assistantMessage.id, conversationId } };
```

meta 必须是**第一个**事件，因为前端需要拿到 `messageId` 才能在 UI 上定位这条消息、做进度关联。落库也在此时完成——数据库里已经有了这条 assistant 消息的占位记录，状态是 `streaming`。后续所有事件都隐含关联到这个 `messageId`。

### 工具开始：tool(start)

拿到模型声明的 `toolCalls` 后，每个 call 执行前先发 start 事件：

```typescript
for (const call of calls) {
  yield {
    event: 'tool',
    data: {
      phase: 'start',
      callId: call.id,
      tool: call.function.name as ToolName,
      argsSummary: summarizeArgs(call.function.name, safeParseArgs(call)),
    },
  };

  const tool = toolMap.get(call.function.name as ToolName);
  const result = tool
    ? await traceAsync(..., () => executeCall(tool, call, toolCtx), ...)
    : runUnknownTool(call.function.name);
  // ...发 end 事件...
}
```

`summarizeArgs` 做了一件很重要的事：把模型传来的原始参数（可能很长、可能包含多余字段）变成一行可读的摘要。比如 `{"query": "WorkBuddy v0.2 架构升级", "topK": 5}` 被摘要为 `"WorkBuddy v0.2 架构升级"`。这个摘要会立即显示在 UI 的"工具卡片"上，告诉用户助手"正在查什么"。

### 工具结束：tool(end)

工具执行完紧接着发 end 事件：

```typescript
yield {
  event: 'tool',
  data: {
    phase: 'end',
    callId: call.id,
    tool: name,
    status: result.ok ? 'ok' : 'error',
    durationMs: Date.now() - startedAt,
    resultSummary: result.summary,
    ...(result.ok ? {} : { error: result.summary }),
  },
};
```

`durationMs` 从 start 到 end 算出来的实际耗时。`fetch_webpage` 可能跑 5-10 秒，这个数字能让用户感知到"这个工具确实花了点功夫"。`status: 'error'` 时额外透传 `error` 字段，前端可以渲染成红色错误态。

### 模型产出：delta

工具执行完后，编排器把 tool 结果追加到 `outgoing` 消息里，再发起下一轮模型调用。下一轮的 delta 事件直接从 provider 层透传：

```typescript
// 在 runProviderTurn 里
for await (const chunk of stream) {
  if (chunk.delta) {
    yield { event: 'delta', data: { content: chunk.delta } };
  }
  // ...
}
```

这里有个关键点：**delta 事件和 tool 事件来自同一台 orchestrator**——它们被 `yield` 的顺序天然保证了时序正确性。同一个 `streamChat` generator 的所有 yield 是串行的，所以前端收到的事件序列一定是 `meta → tool(start) → tool(end) → delta → ...`，不可能乱序。

### 终止：done / error

成功时：

```typescript
conversations.completeMessage(assistantMessage.id, full, usage);
yield { event: 'done', data: { content: full, usage } };
```

失败时（任何阶段的 catch）：

```typescript
const failure = normalizeFailure(error);
conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
yield { event: 'error', data: failure };
```

`done` 里带上最终拼接好的完整 `content` 和 token usage——虽然前端已经累计了所有 delta，但完整 content 可以用来做"消息落库校验"和"重新渲染"（比如刷新页面时从数据库读取）。

## Next.js Route Handler 里的 SSE 发射

`streamChat` generator 产出的是一个个 `OrchestratorEvent` 对象。真正把它们变成 HTTP 响应的是 Next.js 的 Route Handler：

```typescript
// apps/web/src/app/api/chat/stream/route.ts（简化）
import { createChatOrchestrator } from '@wbfm/core';
import { formatSse, type SseEventName, type SsePayloadMap } from '@wbfm/shared';

export async function POST(req: Request) {
  const body = await req.json();
  const orchestrator = createChatOrchestrator(deps);
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of orchestrator.streamChat(body)) {
          const wire = formatSse(event.event as SseEventName, event.data);
          controller.enqueue(new TextEncoder().encode(wire));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // 禁用反向代理缓冲
    },
  });
}
```

`X-Accel-Buffering: no` 这个 header 容易被忽略——它告诉 Nginx/Cloudflare 等反向代理不要缓冲响应，否则 `tool(start)` 和 `tool(end)` 可能被攒在一起才发，前端就看不到实时过程了。

## 前端消费侧：useSSE hook

前端用一个 `useChatStream` hook 消费 SSE，核心逻辑是解析事件后分发到不同的 state 处理器（`apps/web/src/features/chat/use-chat-session.ts`）：

```typescript
// 简化版消费逻辑
for await (const event of sseReader(response.body!)) {
  switch (event.event) {
    case 'meta':
      setMessageId(event.data.messageId);
      conversationIdRef.current = event.data.conversationId;
      break;
    case 'delta':
      appendDelta(event.data.content);
      break;
    case 'tool':
      handleToolEvent(event.data);  // start/end 两阶段
      break;
    case 'citations':
      setCitations(event.data.citations);
      break;
    case 'done':
      setDone(event.data);
      break;
    case 'error':
      setError(event.data);
      break;
  }
}
```

`handleToolEvent` 内部用 `callId` 做关联：

```typescript
function handleToolEvent(payload: ToolEventPayload) {
  if (payload.phase === 'start') {
    setToolTraces(prev => [
      ...prev,
      { callId: payload.callId, tool: payload.tool, argsSummary: payload.argsSummary, status: 'running' },
    ]);
  } else {
    setToolTraces(prev => prev.map(trace =>
      trace.callId === payload.callId
        ? { ...trace, status: payload.status, durationMs: payload.durationMs, resultSummary: payload.resultSummary }
        : trace
    ));
  }
}
```

UI 层渲染这个数组时，running 状态显示一个旋转的 spinner + 灰色工具名，ok 状态显示绿色 ✓ + 结果摘要，error 显示红色 ✗ + 错误信息。同一个 callId 的 start 和 end 被 merge 后，卡片从"正在跑"变成"已完成"。

## 工具事件为什么不合并进 delta？

一个自然的问题是：既然都是增量，为什么不把工具过程塞进 delta 里，让前端统一处理？

原因是 **UI 表达需求完全不同**。delta 要"逐字 append 到气泡里"，而工具过程需要"卡片化展示 + 状态切换 + 耗时感知"。如果塞进 delta，前端还得自己做 JSON.split 解析、自己判断边界——这等于把 orchestrator 已经做好的状态管理再做一遍。

SSE 里不同 event type 就是为了不同的 UI 语义准备的。这不是过度设计，而是一次把"生成文本"和"执行工具"两个本质不同的视觉元素解耦了。

## 并发安全：同一个 message 的 tool trace

还有一个容易被忽略的点：前端可能发起**多次**针对同一个 conversation 的流请求（比如用户快速点两次发送，或者重试）。`tool_trace` 是一个追加数组，如果两次流请求都往同一个 messageId 上写 tool 事件，就会出现重复条目。

WorkBuddy 的处理是：

1. 每条流有一个唯一的 `streamId`（在 `meta` 事件里额外携带，但前端不持久化）。
2. 新的流请求发起时，**前端先 abort 上一个流**（通过 `AbortController`）。
3. 服务端 `AbortSignal` 被触发后，orchestrator 的 `input.signal.aborted` 检查会把当前 message 标记为 `streaming → stopped`，然后直接 yield done。

这套机制保证了**同一个 messageId 在任意时刻只有一个活跃的流**，tool trace 不会重复。

## 小结

SSE 事件序列的设计核心是**让前端能实时看到助手在做什么**。在 v0.1 里，助手只在做一件事——生成文本，所以一个 delta 流就够了。到了 v0.2，助手变成了一个可能多轮循环的编排器，中间穿插的工具过程必须有自己的事件通道。

```
meta（消息 ID）
  → [citations（RAG 引用，可选）]
  → tool(start)（开始执行工具）
  → [耗时...]
  → tool(end)（工具执行完毕，ok/error）
  → [delta...delta]（模型产出下一轮文本或最终回答）
  → [回到 tool(start) 或 done]
```

这个序列的正确性由 AsyncGenerator 的天然串行性保证（`yield` 不会并发），前端消费侧用 `callId` 关联 start/end，就能渲染出完整的"工具链路时间线"。B04 会转到下一个话题：接入 Ollama 这个本地模型 provider 时遇到的坑。
