---
title: "LangSmith 追踪怎么不侵入业务：AOP 包装 provider 调用、mock 注入的四层测试兼容"
series: "WorkBuddy v0.2 技术拆解"
number: "B06"
tags: ["observability", "langsmith", "testing"]
date: "2025-Q4"
---

# LangSmith 追踪怎么不侵入业务

## 追踪的价值与侵入的矛盾

给一个 LLM 应用加链路追踪的动机很直接：你想知道**一次对话里每一步花了多少时间、模型返回了什么、工具执行的输入输出是什么**——这些信息对于调试"为什么模型不调用工具"、"为什么某个知识库片段没被检索到"、"哪轮对话的 token 用量突增"太关键了。

LangSmith 是 LangChain 生态里的追踪平台，API 很直接：开始一个 span（run），结束时上报 outputs 和 error。WorkBuddy 没引 LangChain SDK（太重量级，而且 WorkBuddy 不用 LangChain 的 chain/agent 抽象），所以自己实现了一层轻量 trace client——但核心矛盾是一样的：**怎么在不侵入业务代码的前提下，给每一步都加上 trace 埋点**？

v0.2 的目标是：

1. **业务代码里不出现任何 `import { startRun } from ...`**——追踪逻辑通过 AOP 式包装注入；
2. **关闭追踪时代码路径零感知**——`LANGSMITH_TRACING=false` 时，调用 trace 函数等价于直接执行原函数，没有额外网络请求、没有动态 import 开销；
3. **四层测试全部兼容**——单元测试、集成测试、e2e 测试、前端测试，每层对追踪的 mock 策略不同；
4. **追踪失败不影响主链路**——trace 自身的任何异常（网络超时、API Key 过期）都被静默吞掉，对话继续。

## 设计：TraceHandle 与 traceAsync

追踪层的核心 API 就两个函数（`packages/ai/src/observability/tracer.ts`）：

```typescript
export async function startRun(input: TraceStartInput): Promise<TraceHandle | null>;

export async function traceAsync<T>(
  input: TraceStartInput,
  fn: () => Promise<T>,
  mapOutput?: (value: T) => Record<string, unknown> | undefined,
): Promise<T>;
```

`startRun` 创建一个 span，返回一个 `TraceHandle`，调用方手动控制 `end(outputs, error)` 的时机。`traceAsync` 是更常用的包装器——它把一个 async 函数的 start/end 自动包好，成功时记录 outputs，抛错时记录 error 并原样抛出。

关键设计在 `TraceHandle` 的返回值类型是 `Promise<TraceHandle | null>`——**当追踪未启用时返回 null**。这样调用方只需要：

```typescript
const handle = await startRun({ name: 'chat-turn', runType: 'chain', inputs: {...} });
// handle 可能是 null，后续 .end() 调用需要判空
```

或者用 `traceAsync` 更简单——`handle` 为 null 时直接执行 `fn()`，等价于没有 trace：

```typescript
const result = await traceAsync(
  { name: 'tool:fetch_webpage', runType: 'tool', parent: turnTrace },
  () => executeCall(tool, call, toolCtx),
  (value) => ({ ok: value.ok, summary: value.summary, durationMs: Date.now() - startedAt }),
);
```

追踪是否启用由两个环境变量决定：

```typescript
export function isTracingEnabled(): boolean {
  const on = process.env.LANGSMITH_TRACING ?? process.env.LANGCHAIN_TRACING_V2;
  const key = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY;
  return on === 'true' && Boolean(key);
}
```

这里兼容了两套环境变量（LangSmith 自己的和 LangChain 的），是为了让已有 LangChain 项目的用户直接复用环境配置。

## 零侵入：orchestrator 里的实际用法

现在看 orchestrator 里怎么使用这些函数——**业务代码几乎不感知追踪**：

```typescript
// packages/core/src/chat/chat-orchestrator.ts
import { startRun, traceAsync, type TraceHandle } from '@wbfm/ai';

// 在 streamChat 里
const turnTrace: TraceHandle | null = await startRun({
  name: 'chat-turn',
  runType: 'chain',
  inputs: {
    assistantId: input.assistantId,
    conversationId,
    regenerate: Boolean(input.regenerate),
    content: userContent,
  },
  metadata: { app: 'workbuddy' },
});

// RAG 检索（自动 trace）
if (assistant.retrieveAlways) {
  retrieved = await traceAsync(
    {
      name: 'knowledge_search',
      runType: 'retriever',
      parent: turnTrace,
      inputs: { query: userContent, knowledgeBaseId: assistant.knowledgeBaseId },
    },
    () => input.retrieve!(userContent, assistant, input.signal),
    (result) => result ? { citationCount: result.citations.length, citations: result.citations.map(...) } : { citationCount: 0 },
  );
}

// 工具执行（自动 trace）
const result = await traceAsync(
  {
    name: `tool:${name}`,
    runType: 'tool',
    parent: turnTrace,
    inputs: { callId: call.id, arguments: safeParseArgs(call), argsSummary },
    metadata: { tool: name },
  },
  () => executeCall(tool, call, toolCtx),
  (value) => ({ ok: value.ok, summary: value.summary, durationMs: Date.now() - startedAt }),
);

// finally 里自动 end
finally {
  await turnTrace?.end(
    { content: full, usage, aborted: Boolean(input.signal?.aborted) },
    turnError ?? undefined,
  );
}
```

追踪代码看起来确实"有几行"，但注意**所有 trace 调用都是"包裹"，不是"改写"**——业务逻辑 `input.retrieve!()` 和 `executeCall()` 是原样调用的，trace 层只是在外面套了一层 AOP 壳。如果把 `traceAsync(...)` 换成直接调用，业务行为完全不变。

这和很多 tracing SDK 的"侵入式注入"不同——比如 OpenTelemetry 的 SDK 需要你显式创建 span、把 span context 塞进每个下游调用的 options 里，业务代码里到处飘着 `span.setStatus()`、`ctx.span = span` 之类的样板。WorkBuddy 用 `traceAsync` 包装器把这些样板收起来了。

## traceAsync 的实现：一行核心逻辑

```typescript
export async function traceAsync<T>(
  input: TraceStartInput,
  fn: () => Promise<T>,
  mapOutput?: (value: T) => Record<string, unknown> | undefined,
): Promise<T> {
  const handle = await startRun(input);
  if (!handle) return fn();  // 追踪未启用：直接执行，零开销
  try {
    const value = await fn();
    await handle.end(mapOutput ? mapOutput(value) : undefined);
    return value;
  } catch (error) {
    await handle.end(undefined, error);
    throw error;  // 原样抛出，不吞掉业务异常
  }
}
```

三行核心逻辑：判断 handle 是否为 null → null 则直通 → 否则包 start/end。mapOutput 的作用是**裁剪 trace 输出**——比如 `executeCall` 返回的 `ToolResult.output` 可能是几千字的网页正文，直接塞 trace 会让 LangSmith 面板难读、也浪费网络和存储。mapOutput 让调用方把完整结果裁成 `{ ok, summary, durationMs }` 这种可读的元信息。

## 四层测试的 mock 策略

追踪逻辑本身也需要测试，但更重要的是**业务代码的测试不要被 trace 干扰**。WorkBuddy 按测试层次设计了不同的 mock 方式：

### 第一层：纯函数单元测试

测试对象是 `ToolExecutor.executeToolCall` 这种不依赖任何 provider 调用的纯函数。trace 根本不会被 import，完全不涉及。

### 第二层：带 provider mock 的集成测试

测试对象是 `ChatOrchestrator.streamChat` 的完整流程。这里 trace 会被 import，但我们需要它**不发起真实的 LangSmith 请求**。

两种做法：

**做法 A：环境变量关闭**

```typescript
// vitest.setup.ts
process.env.LANGSMITH_TRACING = 'false';
delete process.env.LANGSMITH_API_KEY;
```

`isTracingEnabled()` 返回 false → `startRun` 返回 null → `traceAsync` 直接调 fn()。**这是最推荐的做法**，因为 trace 的 null-path 本身就是我们要保证的行为。

**做法 B：手动 mock tracer 模块**

```typescript
vi.mock('@wbfm/ai', () => ({
  startRun: vi.fn().mockResolvedValue(null),
  traceAsync: vi.fn((_, fn) => fn()),
}));
```

这种做法在需要**验证 trace 被正确调用**时使用——比如要断言 `traceAsync` 收到了正确的 `runType: 'tool'` 和 `inputs`。但要注意：mock 掉整个模块后，其他从 `@wbfm/ai` 导入的真实类型（比如 `ChatMessage`、`ToolCall`）也会被替换，需要手动保留：

```typescript
vi.mock('@wbfm/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@wbfm/ai')>();
  return {
    ...mod,
    startRun: vi.fn().mockResolvedValue(null),
    traceAsync: vi.fn((_, fn) => fn()),
  };
});
```

### 第三层：e2e 测试（Playwright）

e2e 测试不 mock trace，但**在 e2e 环境里也不开启 trace**——e2e 关心的是"聊天对话能不能正常完成"、"SSE 事件序列对不对"，trace 只是运行时副作用。通过 `.env.e2e` 设置 `LANGSMITH_TRACING=false`。

### 第四层：前端组件测试

前端组件不直接调用 trace（trace 全在 server 端），所以完全不受影响。前端测试关注 SSE 事件消费和 UI 渲染即可。

## trace 自身的可靠性保障

即便在生产环境开启了 trace，我们也必须保证**trace 自己挂了不会让对话挂**。`tracer.ts` 里做了三层保护：

### 保护 1：所有 fetch 都有 5 秒超时 + 静默吞掉

```typescript
async function postRun(url: string, body: unknown): Promise<void> {
  try {
    const resp = await fetch(url, {
      method: url.includes('/runs/') ? 'PATCH' : 'POST',
      headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(`[tracer] ${url.slice(-20)} ${resp.status}`);
    }
  } catch {
    // 静默吞掉所有异常
  }
}
```

不管是超时、DNS 失败、API Key 过期、LangSmith 服务挂了——所有异常都被吞掉。主链路的 orchestrator 不会因为 trace 失败而中断。

### 保护 2：单 span 上报不阻塞对话

`traceAsync` 里的 `handle.end()` 是 await 的，但在真实 `DirectTrace.end()` 里，它只是调一次 PATCH。正常情况下这个 PATCH 在 100-200ms 内完成；异常情况 5 秒超时后被吞掉。如果真的在意"不能等 trace 完成再 yield done"，可以把 `end()` 改成 fire-and-forget（不 await）。但 v0.2 认为 200ms 可以接受——用户等几秒生成后不差这 200ms。

### 保护 3：Dotted Order 与 UUID v7 的实现

LangSmith 的 trace SDK 用一种叫 `dotted_order` 的字段来构建 span 树（子 span 的 dotted_order 是父 span 的 dotted_order 加 `.` 加自己的时间序）。WorkBuddy 自己实现了这个算法和 UUID v7 生成器，**不依赖 LangChain SDK**——省了一个 200KB+ 的 runtime 依赖。

```typescript
function dottedOrder(epoch: number, runId: string, execOrder: number): string {
  const iso = new Date(epoch).toISOString().slice(0, -1);
  const paddedOrder = execOrder.toString().slice(0, 3).padStart(3, '0');
  return `${iso}${paddedOrder}Z`.replace(/[-:.]/g, '') + runId.replace(/-/g, '');
}
```

这段代码直接照搬 LangChain SDK 的算法实现，经过对比测试确认能被 LangSmith 正确解析成 span 树。

## 实际效果

在 LangSmith 面板里，一次完整对话的 span 树长这样：

```
chat-turn (chain)
  ├── knowledge_search (retriever)
  │     └── 3 citations matched
  ├── chat:qwen2.5:7b (llm)
  │     ├── tool:fetch_webpage (tool)
  │     └── chat:qwen2.5:7b (llm)   ← 模型拿到 tool 结果后再次调用
  └── chat:qwen2.5:7b (llm)         ← 最终回答
```

每个 span 都有 start/end 时间、inputs/outputs（经过 mapOutput 裁剪）、metadata（providerId、modelId、temperature）。追踪未开启时，这棵树完全不存在，orchestrator 的代码路径没有任何 trace 调用——**零开销**。

## 小结

LangSmith 追踪不侵入业务的三个核心手段：

| 手段 | 实现 | 效果 |
|------|------|------|
| 开关隔离 | `isTracingEnabled()` → `startRun` 返回 null | 关闭时 traceAsync 等价于直通，零开销 |
| AOP 包装 | `traceAsync(fn)` 自动包 start/end | 业务代码只写 fn 本身 |
| 失败吞掉 | 所有 fetch 异常静默忽略 | trace 挂了对话继续 |

四层测试策略：单元测试不涉及 → 集成测试用 `LANGSMITH_TRACING=false` 环境变量关闭 → e2e 测试同样关闭 → 前端测试完全不感知。

B07 会转到消息重生成这个话题——这是 chat 应用里另一个容易出并发 bug 的角落。
