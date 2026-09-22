---
title: "模型不支持工具调用时的优雅降级：400 自动去工具重试"
series: "WorkBuddy v0.3 技术拆解"
number: "B06"
tags: ["workbuddy", "tool-calling", "fallback", "ollama", "qwen2.5vl"]
date: "2025-Q4"
---

## 问题起源：supportsTools 是 provider 级还是 model 级？

v0.2 里我们有一个 `supportsTools` 布尔值，存在 provider 配置里：

```typescript
interface Provider {
  id: string;
  name: string;
  type: 'openai' | 'ollama' | 'custom';
  supportsTools: boolean;   // ← provider 级别的一刀切
}
```

语义很简单：如果这个 provider 支持 function calling 协议，`supportsTools = true`。在 `ChatOrchestrator` 里用它决定要不要组装 `toolDefs`：

```typescript
// v0.2 的逻辑
const toolDefs = target.provider.supportsTools ? toToolDefinitions([...toolMap.values()]) : [];
```

这个设计在 v0.2 没问题——Ollama 上你只跑 qwen2.5 或 llama3.2，要么全支持工具，要么全不支持。

v0.3 加视觉之后，真机测到了一个矛盾情况：

- Ollama provider → `supportsTools = true`（Ollama 端点**理论上**支持 tools）
- 但 qwen2.5vl:7b 模型 → 带 tools 请求直接 400

用户场景：assistant 绑了 qwen2.5vl:7b 模型，开了 knowledge_search 工具（因为想让它看图后查知识库补充背景）。请求发出 → Ollama `/v1/chat/completions` 返回 400 → 用户等了 30 秒看到 error → 一脸懵。

### 为什么 provider 级别的标志不够

真正的语义应该是：

```typescript
interface Model {
  id: string;
  providerId: string;
  modelId: string;          // Ollama 上对应 qwen2.5vl:7b
  capabilities: string[];   // ['vision', 'tools', 'embedding']  ← model 级别
}
```

但改 `supportsTools` 的粒度是一个大迁移——数据库 schema、ProviderService、UI 模型管理页面都要改。v0.3 里我们选了一条**更务实的路：不改 schema，运行时降级**。

---

## 降级方案：runProviderTurnWithToolFallback

`packages/core/src/chat/tool-runner.ts`：

```typescript
export async function* runProviderTurnWithToolFallback(
  params: TurnParams,
): AsyncGenerator<OrchestratorEvent, ProviderTurn> {
  if (params.tools.length === 0) return yield* runProviderTurn(params);   // 没工具，直接走正常路径
  try {
    return yield* runProviderTurn(params);                                 // 第一次：带 tools
  } catch (error) {
    if (!isToolsUnsupportedError(error)) throw error;                     // 不是工具不支持 → 原样抛出
    return yield* runProviderTurn({ ...params, tools: [] });              // 是工具不支持 → 去掉 tools 重试
  }
}
```

两个关键函数：

### 工具不支持错误的识别

```typescript
export function isToolsUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not support tools|tools?\s+is not supported|unsupported tools?/i.test(message);
}
```

这个正则匹配我们在真机上看到的三种典型错误信息：

| 错误来源 | 错误信息 |
|----------|----------|
| Ollama 0.4 | `model does not support tools` |
| OpenAI 兼容端点（旧版） | `tools is not supported for this model` |
| 其他 provider | `unsupported tools parameter` |

### 为什么 catch 里直接重抛非工具错误

```typescript
if (!isToolsUnsupportedError(error)) throw error;
```

因为 HTTP 400 可能有很多原因（payload 格式错、model 不存在、provider 挂了）。只有确定是「模型不支持 tools」才重试一次，其他错误让它按正常路径抛出、被外层 catch 处理（yield error 事件）。

---

## 为什么 fallback 只重试一次

```typescript
return yield* runProviderTurn({ ...params, tools: [] });   // ← 只调一次
```

不做循环，不做多次降级，原因：

1. **工具不支持是确定性错误**：同一模型同一 provider，tools 不支持就是永远不支持，重试第二次也没用
2. **网络错误可能需要 retry，但那是 fetch-with-retry 的职责**：我们已经在 `fetchWithRetry` 里做了 3 次 + 指数退避，`runProviderTurnWithToolFallback` 不重复做 retry
3. **幂等性**：第一次 `runProviderTurn` 在流打开前就收到了 400（Ollama 对 tools 不支持的错误是同步返回的，不是流式的），所以没有已产出的增量需要回滚

### 时序保证

```
第一次 runProviderTurn（带 tools）
  │
  ├── 组装 ChatBody（含 tools array）
  ├── openSseChannel（发起 HTTP 请求）
  ├── await fetch()
  │     │
  │     └── Provider 返回 400，还没写任何 SSE body
  │
  └── throw Error('model does not support tools')  ← 还没 yield 任何 delta
  
fallback 触发
  │
  ├── isToolsUnsupportedError → true
  └── runProviderTurn（不带 tools）
        ├── 组装 ChatBody（tools = undefined）
        ├── openSseChannel → 这次成功了
        └── yield delta ... delta ... done
```

**关键：fallback 发生在 SSE 流打开之前**。`openSseChannel` 内部 `fetch()` 收到非 2xx 响应就 throw，此时 generator 还没 yield 任何 delta 事件。外层 `chat-orchestrator` 的 try/catch 能正常接住第一次 400 的 error，然后 fallback 路径自己重新跑。

但等等——`runProviderTurnWithToolFallback` 是一个 generator，它内部 try 了之后 catch 了然后重新 yield 另一个 generator。这个嵌套 generator 展开的时候，外层看到的是：

```typescript
// chat-orchestrator 里
const turn = runProviderTurnWithToolFallback({
  target, assistant, messages, tools: toolDefs, signal, traceParent: turnTrace,
});

let outcome: ProviderTurn;
while (true) {
  const step = await turn.next();
  if (step.done) { outcome = step.value; break; }
  yield step.value;   // ← delta 事件
}
```

第一次调用 `turn.next()` 时，generator 执行到 `try { return yield* runProviderTurn(params); }`。如果 `runProviderTurn` 在第一次 `fetch()` 就 throw 了，`return yield*` 会被 try 块接住，进入 catch。catch 里 `return yield* runProviderTurn({...params, tools: []})` 会**重新进入**第二次 run——此时 delta 才开始产出。

**用户体验上完全无感**——不会看到一个 error 事件然后重连，整个 fallback 在一次 SSE 连接内完成。

---

## 如果 provider 返回了部分 SSE 然后才报错怎么办

真机测试里我们看到 Ollama 对 tools 不支持的情况是**同步 400**——在写任何 SSE body 之前就返回了。但理论上存在一种坏情况：provider 先吐了几个 delta，然后才报错说 tools 不支持。

我们现在的 fallback 不处理这种情况——只要 generator 已经 yield 过任何 delta，catch 里的 error 就被上一层的 while(true) 循环捕获，而不是 `runProviderTurnWithToolFallback` 自己的 try/catch。

原因很简单：**部分产出后 fallback 会导致内容重复**（用户已经看到一半回答了，再 retry 会产出另一份完全不同的回答）。这种情况下我们选择**把错误正常抛出，让外层 yield error 事件**，而不是静默重试。用户会看到「请求失败，可能由于模型不支持工具」，然后手动换模型。

如果未来真的遇到这种「部分 SSE 后报错 tools 不支持」的 provider，可以在 `runProviderTurn` 里记录一个 `yieldedDeltaCount`，fallback 只在 count === 0 时触发。但目前不需要。

---

## 在 ChatOrchestrator 里的接入

```typescript
// chat-orchestrator.ts
for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
  const turn = runProviderTurnWithToolFallback({   // ← 替换了原来的 runProviderTurn
    target, assistant, messages: outgoing, tools: toolDefs, signal: input.signal,
    traceParent: turnTrace,
  });
  // ... while(step) 循环 ...
}
```

改动极小——原来的 `runProviderTurn` 只有两处调用（chat-orchestrator 里 round 循环 + 可能一个单测），换成 `runProviderTurnWithToolFallback` 就好。单测里可以直接 mock `runProviderTurn` 让它第一次 throw / 第二次正常，验证 fallback 路径。

---

## 测试覆盖

```typescript
// tool-runner.ts 里的单元测试
describe('runProviderTurnWithToolFallback', () => {
  it('passes through when no tools configured', async () => {
    // tools.length === 0 → 直接走 runProviderTurn，不尝试 tools
  });

  it('retries without tools on tools-unsupported 400', async () => {
    const calls = [];
    // mock runProviderTurn：第一次 throw 'model does not support tools'，第二次正常
    const result = await collect(runProviderTurnWithToolFallback({ tools: [{...}] }));
    expect(calls.length).toBe(2);
    expect(calls[0].tools.length).toBe(1);     // 第一次带 tools
    expect(calls[1].tools.length).toBe(0);      // 第二次不带 tools
  });

  it('does NOT retry on non-tools errors', async () => {
    // mock runProviderTurn throw 'HTTP 500: internal server error'
    await expect(collect(runProviderTurnWithToolFallback({ tools: [{...}] })))
      .rejects.toThrow('HTTP 500');
  });
});
```

---

## 小结

`runProviderTurnWithToolFallback` 的设计哲学是：**在最小改动下解决最常见的不兼容问题**。

- 不改数据库 schema（不把 `supportsTools` 拆到 model 级别）
- fallback 只做一次（避免无限重试）
- 只在流打开前触发（保证没有已产出增量）
- 非工具不支持的错误原样抛出（不误伤正常错误）
- 接入点只有一处（替换 `runProviderTurn` 的调用）

这个 fallback 完美适配了 v0.3 的实际场景：qwen2.5vl 支持视觉但不支持工具——assistant 开了工具后，第一次请求 400 → 自动去掉 tools 重试 → 模型直接用 RAG 上下文回答。用户完全无感，看到的是正常的对话体验。

如果未来要做完整的 model-level capabilities 配置，`runProviderTurnWithToolFallback` 可以继续作为**网络降级层**（就算配置了 supportsTools=true，实际 provider 还是可能不支持），和 model-level 配置配合使用，而不是互斥。

下一篇 B07 讲 PDF intake 的三大坑——fake worker 相对路径、中文逐字换行、externals 修复的完整链路复盘。
