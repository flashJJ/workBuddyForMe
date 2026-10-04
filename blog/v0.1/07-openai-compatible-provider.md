# 一套代码接入所有大模型：OpenAI 兼容适配器设计

> OpenAI、DeepSeek、通义、智谱、火山方舟……为什么换个供应商不用改业务代码？

## 抽象的价值

如果业务代码里直接写 `fetch('https://api.openai.com/v1/chat/completions')`，那换 DeepSeek 就要改 URL、改鉴权、改响应解析——散落在各处，改一次崩一次。

解法：**定义一个 Provider 接口，所有供应商实现它，业务代码只面向接口编程**。

## ChatProvider 接口

```ts
interface ChatProvider {
  chatStream(params: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<{ delta?: string; usage?: TokenUsage }>;

  embed(params: {
    model: string;
    input: string[];
    signal?: AbortSignal;
  }): Promise<{ vectors: number[][] }>;

  listModels(): Promise<ModelInfo[]>;
  testConnection(signal?: AbortSignal): Promise<void>;
}
```

四个方法覆盖对话、向量化、模型列表、连通性测试。业务层（core）只认这个接口，不管底下是哪家。

## OpenAI 兼容适配器

市面上绝大多数大模型服务都兼容 OpenAI API 格式（包括国内的 DeepSeek、通义、智谱、火山方舟等）。所以一个适配器就能吃下大部分供应商：

```ts
function createOpenAICompatible(config): ChatProvider {
  return {
    async *chatStream({ model, messages, temperature, signal }) {
      const response = await fetchSse(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model, messages, temperature, stream: true }),
        signal,
      });

      for await (const event of parseSse(response)) {
        if (event.data === '[DONE]') break;
        const delta = event.data.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
      }
    },
    // embed / listModels / testConnection 类似
  };
}
```

用户在设置页填 `baseUrl`、`apiKey`、模型名，就能接入任何 OpenAI 兼容服务。

## HTTP 底座：超时、重试、错误归一化

适配器底下是统一的 HTTP 封装，处理所有供应商共有的脏活：

### 超时

用 `AbortSignal.timeout()` 设默认超时（30s）。但 SSE 流特殊：响应头到达后解除超时，否则长回复会被误杀。

### 重试

只对**可重试**的错误重试：
- 连接错误（网络抖动）✅ 重试
- 5xx（上游临时故障）✅ 重试，指数退避
- 4xx（用户输入/鉴权问题）❌ 立即失败
- 客户端 abort ❌ 不重试

默认重试 2 次，退避 1s → 2s。

### 错误归一化

不同供应商的错误格式五花八门，统一成领域错误：

```ts
class ProviderError extends Error {
  status: number;        // HTTP 状态码
  providerMessage: string; // 上游原始消息
  retriable: boolean;    // 是否可重试
}
```

业务层不用关心上游返回什么格式，只处理归一化后的 `ProviderError`。

## 注册中心：按协议选适配器

```ts
const registry = {
  'openai-compatible': createOpenAICompatible,
  'ollama': createOllamaProvider, // 预留
};

function getProvider(protocol, config) {
  const factory = registry[protocol];
  if (!factory) throw new Error(`不支持的协议: ${protocol}`);
  return factory(config);
}
```

新增供应商？只要它兼容 OpenAI，用户填配置就行，代码一行不用改。不兼容？加个适配器实现 `ChatProvider` 接口，注册进去。

## 连接测试的设计

设置页有个「测试连接」按钮，用户填完 Key 还没保存就能测。这个接口允许用**临时未保存的配置**测试：

```ts
// providerTestSchema
z.union([
  z.object({ id: z.string() }),              // 测已保存的供应商
  z.object({ protocol, baseUrl, apiKey }),   // 测临时配置
]);
```

实现就是调 `testConnection()`（内部发一个最小请求，比如 GET /models），成功返回 `{ ok: true }`，失败返回归一化错误。

## Embedding 的批量处理

OpenAI 的 embeddings 接口有限制（单次最多若干条输入）。适配器自动分批：

```ts
async embed({ model, input, signal }) {
  const BATCH = 64;
  const results: number[][] = [];
  for (let i = 0; i < input.length; i += BATCH) {
    const batch = input.slice(i, i + BATCH);
    const resp = await fetchJson(`${baseUrl}/embeddings`, {...});
    // 按 index 归位，防止乱序
    for (const item of resp.data) results[item.index] = item.embedding;
  }
  return { vectors: results };
}
```

还要校验维度一致性——同一批向量维度必须相同。

## 小结

一套代码接入所有大模型的关键：

1. **面向接口编程**：定义 `ChatProvider`，业务层不认具体供应商
2. **OpenAI 兼容适配器**：吃下 90% 的市场，用户填配置即用
3. **HTTP 底座统一**：超时、重试、错误归一化，适配器只管协议差异
4. **注册中心可扩展**：新协议加个适配器，不动业务代码

这样，从 OpenAI 换到火山方舟，用户改个 baseUrl 就行，代码零改动。

下一篇聊聊「Electron 桌面应用的进程模型：为什么 fork Next.js standalone」。
