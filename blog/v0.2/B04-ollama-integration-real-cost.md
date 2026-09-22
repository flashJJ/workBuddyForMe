---
title: "接入 Ollama 的真实代价：OpenAI 兼容接口 vs 原生 /api/chat、流式解析差异、模型能力探测"
series: "WorkBuddy v0.2 技术拆解"
number: "B04"
tags: ["ollama", "llm", "adapter"]
date: "2025-Q4"
---

# 接入 Ollama 的真实代价

## 为什么选 OpenAI 兼容端点

WorkBuddy 是一个多 provider 架构——用户可以接云端 OpenAI、Anthropic、也可以接本地 Ollama。多 provider 的好处是用户不被绑死，但代价是每个 provider 都要写一层 adapter。v0.1 写了 OpenAI adapter，到 v0.2 要加 Ollama，最自然的想法是：Ollama 自 0.3 起就提供了 OpenAI 兼容的 `/v1/chat/completions` 端点，是不是可以直接复用现有 adapter？

答案是：**可以复用聊天和向量化，但不能复用模型列表**。原因是 Ollama 早期版本的 `/v1/models` 返回不一致——有的版本返回空数组，有的版本缺少必要字段。而原生 `GET /api/tags` 从 Ollama 0.1 起就稳定返回 `models[]`，字段是 `name`（"qwen2.5:7b"）和 `size`、`modified_at` 等。所以 WorkBuddy 的 Ollama adapter 做了一个"混合策略"：

| 能力 | 走的端点 | 原因 |
|------|----------|------|
| 聊天流式 `/chat` | 兼容端点 `/v1/chat/completions` | 与 OpenAI 同协议，零额外代码 |
| 向量化 `/embed` | 兼容端点 `/v1/embeddings` | 同上 |
| 模型列表 `listModels` | 原生 `/api/tags` | `/v1/models` 在旧版本不可靠 |
| 连接探活 `testConnection` | 原生 `/api/tags` | 跟 listModels 同源，额外开销低 |

对应代码（`packages/ai/src/adapters/ollama/adapter.ts`）：

```typescript
export function createOllamaAdapter(connection: ProviderConnection): ChatProvider {
  const openAiConnection: ProviderConnection = {
    ...connection,
    baseUrl: normalizeOllamaBaseUrl(connection.baseUrl),  // 补 /v1
  };
  const openAi = createOpenAiCompatibleAdapter(openAiConnection);

  return {
    supportsTools: true,
    testConnection: async (signal) => {
      await ollamaListModels(connection, signal);  // 原生线
    },
    listModels: (signal) => ollamaListModels(connection, signal),  // 原生线
    chatStream: (params) => openAi.chatStream(params),  // 兼容线
    embed: (params) => openAi.embed(params),            // 兼容线
  };
}
```

URL 归一化是个小但重要的细节。用户通常只填 `http://127.0.0.1:11434`（Ollama 默认端口），但兼容端点需要 `/v1` 前缀，原生端点不需要。所以两个辅助函数（`packages/ai/src/adapters/ollama/url.ts`）：

```typescript
export function normalizeOllamaBaseUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (/\/v1$/i.test(base)) return base;     // 用户已填 /v1 就不重复
  return `${base}/v1`;
}

export function normalizeOllamaOrigin(baseUrl: string): string {
  // 给原生端点用：去掉 /v1
  return normalizeOllamaBaseUrl(baseUrl).replace(/\/v1$/i, '');
}
```

这样即使用户填了 `http://localhost:11434/v1`（或漏掉尾部斜杠、大小写不同），归一化后也能正确拼出 `/v1/chat/completions` 和 `/api/tags`。

## 流式解析：一个坑比一个坑

复用 OpenAI 兼容端点意味着 SSE 格式是一样的——`data: {JSON}\n\n`，增量在 `choices[0].delta` 里，结束时发 `data: [DONE]`。看起来很简单，但实际跑起来有几个差异点值得写出来。

### 坑 1：tool_calls 的增量拼装

OpenAI 和 Ollama 都把 tool_call 的内容拆成多个 SSE chunk 发送。例如一个 tool_call `{id: 'call_abc', function: {name: 'fetch_webpage', arguments: '{...}'}}` 可能被拆成：

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc"}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"fetch_webpage"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"url\""}}]}}]}

... 直到 finish_reason=tool_calls 时最后一发
```

原始增量里每个 chunk 只包含 tool_call 的一部分字段，arguments 甚至是按字符拆的。我们需要一个 accumulator 来按 index 合并：

```typescript
// 简化自 packages/ai/src/adapters/openai/payloads.ts
class ToolCallAccumulator {
  private calls = new Map<number, { id?: string; name?: string; argsBuf: string }>();

  absorb(deltas?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>) {
    if (!deltas) return;
    for (const delta of deltas) {
      const existing = this.calls.get(delta.index) ?? { argsBuf: '' };
      if (delta.id) existing.id = delta.id;
      if (delta.function?.name) existing.name = delta.function.name;
      if (delta.function?.arguments) existing.argsBuf += delta.function.arguments;
      this.calls.set(delta.index, existing);
    }
  }

  assemble(): ToolCall[] {
    return [...this.calls.entries()].map(([_, v]) => ({
      id: v.id ?? '',
      function: {
        name: v.name ?? '',
        arguments: v.argsBuf,  // 拼完整后再 parse
      },
    }));
  }
}
```

这个 accumulator 在 `openAiChatStream` 里被创建一次，每次收到 SSE 事件就 `absorb`，只有当 `finish_reason === 'tool_calls'` 时才 `assemble` 并 yield 完整对象。这样编排器拿到的一定是**完整且可 JSON.parse** 的 arguments。

### 坑 2：Ollama 0.3 vs 0.4 的 finish_reason 差异

Ollama 0.3 在模型不支持工具调用时，返回的 `finish_reason` 可能是 `'stop'` 而不是 `'tool_calls'`——同时 tool_calls 数组为空。这导致两个问题：

1. 模型"想说它不支持 tools"但说得不明显；
2. 编排器看到 `toolCalls.length === 0` 就直接结束循环，不会降级重试。

Ollama 0.4 修复了这个问题：不支持时会在 HTTP 层直接返回 400，错误信息里明确包含 `"does not support tools"`。WorkBuddy 在 `tool-runner.ts` 里利用这个信息做降级（见 B02 里的 `runProviderTurnWithToolFallback`），但 0.3 的兼容意味着我们还需要在"成功响应但无 toolCalls + content 为空"时加一层启发式 fallback——直接让编排器进入下一轮（不带 tools），让模型自己出回答。

### 坑 3：usage 字段缺失

OpenAI 的 SSE 流会在最后一个 chunk 里带上 `usage: {prompt_tokens, completion_tokens, total_tokens}`。但 Ollama 的 `/v1/chat/completions` 在流式模式下**不返回 usage**（非流式模式返回）。这导致前端 UI 里的 token 用量永远显示为 null。

WorkBuddy 的解法是：**在 provider 消费侧允许 usage 为 null**，orchestrator 和前端都不依赖这个字段做决策。对于本地用户来说，token 用量本来就不影响计费，只是个调试信息——显示 `null` 比瞎编一个数字强。

## 连接管理：冷启动的特殊处理

本地模型有个独有的问题：**冷启动首 token 特别慢**。Ollama 收到请求后可能需要先把模型从磁盘加载到 GPU/CPU 内存，这个过程可能要 10-30 秒。在模型加载期间，HTTP 连接已经建立了（TCP 握手完成），但 Ollama 迟迟不返回第一个响应字节。

标准的 fetch `timeout` 往往把"连接超时"和"首字节超时"绑在一起——如果我们把 `timeout` 设为 30 秒，正常请求里模型加载完但推理慢的情况也会被误杀。WorkBuddy 的 `fetch-with-retry` 里做了两层分离：

```typescript
// packages/ai/src/http/fetch-with-retry.ts（简化）
export async function fetchWithRetry(url, options) {
  // connectTimeout 只覆盖 TCP 握手 → 收到响应头的时间
  const connectSignal = AbortSignal.timeout(CONNECT_TIMEOUT_MS);  // 5s
  // bodyTimeout 单独管理响应体读取（流的阶段）
  const response = await fetch(url, { ...options, signal: connectSignal });
  // ...
}
```

再加上 Ollama adapter 里的特殊放宽：

```typescript
// packages/shared/src/constants.ts
export const CHAT_CONNECT_TIMEOUT_MS = 180_000;  // 3 分钟，专为本地模型
```

`openAiChatStream` 里用这个超时（见上一节代码里的 `timeoutMs: CHAT_CONNECT_TIMEOUT_MS`），这样云端模型（通常 5-10 秒内就返回响应头）和本地模型（可能 30 秒）都能正常工作。

## 模型能力探测：supportsTools 的两层门控

之前 B01 提到过，WorkBuddy 有两层工具能力门控。这里展开一下具体实现：

**Provider 级（硬编码）**：

```typescript
// Ollama adapter
supportsTools: true,  // Ollama 0.3+ 都兼容 OpenAI function-calling

// OpenAI adapter
supportsTools: true,  // GPT-3.5-turbo / GPT-4 / GPT-4o 都支持
```

这个值在 provider 注册时固定，不随具体模型变化。Ollama adapter 里 `supportsTools: true` 指的是"这个 provider 类型整体兼容 tools 协议"，不是"所有 Ollama 模型都支持"。

**模型级（调用时探测）**：

编排器在构建工具定义时，把 `provider.supportsTools` 和调用级降级组合使用：

```typescript
const toolMap = runtime.buildTools(assistant, target.provider.supportsTools);
const toolDefs = toToolDefinitions([...toolMap.values()]);
// 这里 toolDefs 只有在 toolMap 非空时才有内容
// 而 toolMap 为空的两种情况：provider.supportsTools=false 或助手没开任何工具

// 真正调用时
const outcome = await runProviderTurnWithToolFallback({
  target,
  tools: toolDefs,  // 空数组时直接不带 tools 参数
});
```

`runProviderTurnWithToolFallback` 的逻辑已经在 B02 里讲过：先试带 tools，400 里含 "does not support tools" 就去掉重试一次。这个设计的妙处在于——**它同时覆盖了两种"不支持"**：

1. Provider 类型本身不支持（`supportsTools = false`）：toolMap 为空，tools 参数是空数组，直接走纯文本调用。
2. Provider 支持但具体模型不支持：先用 tools 参数调用收到 400，降级重试。

两层门控叠加后，同一个助手在 OpenAI 和 Ollama 上都能稳定工作——只是 Ollama 上可能遇到模型级的降级（比如 qwen2.5vl 视觉模型不支持 tools），而 OpenAI 上 GPT-4o 总是支持。

## 为什么不直接用原生 /api/chat

到这里你可能会问：既然有 `/v1/chat/completions` 兼容端点，那原生 `/api/chat` 还有必要碰吗？

v0.2 的答案是**没必要**，但值得把对比列出来，方便 v0.3 做决策：

| 维度 | /v1/chat/completions | /api/chat |
|------|----------------------|-----------|
| 协议 | 跟 OpenAI 一致，复用 adapter | Ollama 自有格式，要写新 adapter |
| 流式格式 | SSE，`choices[0].delta` | NDJSON，`message` 字段直接是增量 |
| tool_calls | OpenAI 格式，需要 accumulator | Ollama 自有 `tool_calls` 数组，格式略不同 |
| 视觉输入 | `image_url` data URL | 原生 `images: ['base64...']` 数组 |
| usage | 流式时缺失 | 流式时**完整**返回 |
| 兼容性 | Ollama 0.3+ | 所有版本 |

v0.2 选兼容端点的核心理由是**减少维护面**——多写一套 adapter + accumulator + payload 映射只为了拿到流式 usage？在本地用户不在乎 token 计费的场景下，这个性价比很低。视觉输入方面，Ollama 真机实测证明 `/v1/chat/completions` 正确消费 data URL 图片（纯色图被准确描述、prompt_tokens 包含图像），所以没有必要切原生端点。

但 `/api/chat` 流式时**返回完整 usage** 这个点值得记下来——如果 v0.3 要做"对话成本统计"，可能需要在 Ollama 专用 provider 上切回原生端点。

## 小结

接入 Ollama 的核心结论是：

1. **聊天和向量化走 OpenAI 兼容端点，模型列表和探活走原生 `/api/tags`**——这是在"复用代码"和"稳定性"之间的最优权衡。
2. **tool_calls 增量必须 accumulator 拼装**——OpenAI 和 Ollama 都拆包，不攒齐就 parse 会炸。
3. **流式 usage 缺失不是 bug 而是功能设计**——本地用户不计费，接受 null 比硬编数值好。
4. **冷启动超时要分层**——连接超时放宽到 3 分钟，请求体流超时独立管理，避免误伤正常推理。
5. **能力探测用"先试后降级"**——两层门控覆盖 provider 级不支持和模型级不支持两种情况。

B05 会专门展开本地模型冷启动的完整话题——连接超时、首 token 延迟、chat 与 completion 端点的分流等。
