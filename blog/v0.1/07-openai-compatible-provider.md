# 一套代码接入所有大模型：OpenAI 兼容适配器设计

一个本地 AI 应用迟早要面对换供应商的问题：今天用 OpenAI，明天想试 DeepSeek，后天用户自己填了通义、智谱或火山方舟的 Key。如果业务代码里散落着直连供应商地址的 `fetch`，换一家就要改 URL、改鉴权头、改响应解析——改一次崩一次。

这篇讲适配层的设计：**定义一个 Provider 接口，所有供应商实现它，业务代码只面向接口编程**。外加统一的 HTTP 底座处理超时、重试和错误归一化。

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

四个方法覆盖对话流式输出、文本向量化、模型列表、连通性测试。业务层（core）只认这个接口，完全不关心底下接的是哪家服务。

## OpenAI 兼容适配器：一个适配器吃下大部分供应商

市面上绝大多数大模型服务都兼容 OpenAI 的 API 格式，国内的 DeepSeek、通义、智谱、火山方舟等也都在其列。差异只剩下 `baseUrl`、鉴权 Key 和模型名。所以一个适配器就能覆盖绝大多数供应来源：

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
    // embed / listModels / testConnection 同理
  };
}
```

用户在设置页填 `baseUrl`、`apiKey`、模型名，就能接入任何 OpenAI 兼容服务，无需发版。

## HTTP 底座：超时、重试、错误归一化

适配器底下是一层统一的 HTTP 封装，把所有供应商共有的脏活收口在一处。

### 超时

用 `AbortSignal.timeout()` 设默认超时（30s）。但 SSE 流要特殊处理：**响应头到达后立即解除超时**，否则一段正常的长回复会被误判为超时而掐断。

### 重试

只对**可重试**的错误重试，分类必须明确：

- 连接错误（网络抖动）✅ 重试；
- 5xx（上游临时故障）✅ 重试，指数退避；
- 4xx（用户输入或鉴权问题）❌ 立即失败；
- 客户端主动 abort ❌ 不重试。

默认重试 2 次，退避间隔 1s → 2s。流式通道建立之后则完全不重试（理由见上一篇：重试会重复计费并打乱已展示内容）。

### 错误归一化

不同供应商的错误格式五花八门，统一收口成一个领域错误类型：

```ts
class ProviderError extends Error {
  status: number;         // HTTP 状态码
  providerMessage: string; // 上游原始消息
  retriable: boolean;     // 是否可重试
}
```

业务层不需要知道各家供应商的错误体长什么样，只处理归一化后的 `ProviderError`，再由 API 层映射成领域错误码（错误码体系见后续篇章）。

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

新增供应商分两种成本：兼容 OpenAI 的，用户填配置即可，代码一行不用改；协议不兼容的，写一个实现 `ChatProvider` 接口的适配器注册进去，业务代码同样不动。

## 连接测试：允许用未保存的临时配置

设置页有个「测试连接」按钮，用户填完 Key、还没点保存时就要能测。所以测试接口的入参用 Zod 写成两种形态的联合类型：

```ts
// providerTestSchema
z.union([
  z.object({ id: z.string() }),              // 测已保存的供应商
  z.object({ protocol, baseUrl, apiKey }),   // 测临时配置
]);
```

实现就是调 `testConnection()`（内部发一个最小请求，比如 GET /models），成功返回 `{ ok: true }`，失败返回归一化错误。临时配置不落库、不留痕。

## Embedding 的批量处理

OpenAI 兼容的 embeddings 接口对单次输入条数有限制。适配器自动分批，并按返回的 index 归位：

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

按 `index` 归位而不是按响应顺序 append，是为了防止任何一批乱序返回时向量和文本错配。另外还要校验维度一致性——同一批向量维度必须相同，否则直接报错而不是静默写坏索引。

## 小结

一套代码接入所有大模型的关键：

1. **面向接口编程**：定义 `ChatProvider`，业务层不认具体供应商；
2. **OpenAI 兼容适配器**：覆盖绝大多数供应来源，用户填配置即用；
3. **HTTP 底座统一**：超时、分类重试、错误归一化收口，适配器只管协议差异；
4. **注册中心可扩展**：新协议加一个适配器，业务代码零改动。

这样从一家供应商换到另一家，用户改个 `baseUrl` 就行，代码零改动。下一篇讲桌面进程模型：Electron 主进程为什么要 fork 一个 Next.js standalone server。
