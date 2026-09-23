---
title: "本地模型冷启动痛点：首 token 延迟、连接超时、chat 与 completion 端点分流"
series: "WorkBuddy For Me v0.2 技术拆解"
number: "B05"
tags: ["ollama", "local-llm", "latency"]
date: "2025-Q4"
---

# 本地模型冷启动痛点

## 什么是"冷启动"

WorkBuddy For Me 支持本地模型（Ollama）作为 provider。云端模型（OpenAI/Anthropic）收到请求后，首 token 延迟（TTFT，Time To First Token）通常在 200ms-1s 之间；但本地模型第一次收到请求时，Ollama 需要先把模型从磁盘加载到内存（可能是 GPU 显存或 CPU RAM）。这个过程对 7B 模型可能需要 5-15 秒，对 14B+ 模型可能到 30-60 秒。在模型加载完成、开始生成之前，HTTP 连接已经建立了（TCP 握手完成），但 Ollama 迟迟不返回响应头——**整个 fetch 调用被卡在"等响应头"这一步**。

我们把这个模型加载阶段称为"冷启动"，它跟云端的冷启动（AWS Lambda 等）概念类似但更极端：云端冷启动通常是容器初始化 1-5 秒，本地模型冷启动是模型权重加载 10-60 秒，差距一个数量级。

v0.2 的核心挑战是：**怎么让同一个 HTTP 客户端同时适配云端的 5 秒超时和本地的 180 秒超时**，并且在冷启动结束后自动切回正常的流式超时行为。

## 问题拆解：三种超时

在动手之前，先把本地模型场景下的超时分成三种：

1. **连接超时**：从发起 fetch 到收到响应头的时间。冷启动时这可能是 30-60 秒。
2. **流式间隔超时**：已经在收 SSE chunk，但两个 chunk 之间的空闲时间。正常生成时 chunk 间隔通常 50-200ms；如果模型在思考（reward model/self-reflection 等），可能到 2-5 秒。
3. **总请求超时**：从 fetch 发起到整个响应体读完的总时间。对本地长文本生成可能需要几分钟。

WorkBuddy For Me 的策略是：**只显式管理连接超时**，流式间隔和总超时交给浏览器/Node 默认行为（实际上无限）。原因很简单：SSE 是长连接，设流式间隔超时容易误杀慢思考；总超时对本地生成不现实（用户让模型写代码可能跑 5 分钟）。所以核心问题就是：**连接超时取多少？**

如果取 5 秒（云端默认），本地模型第一次请求必挂。如果取 180 秒，云端 provider 真挂了时要等 3 分钟才知道。折中方案：**按 provider 类型分层**。

## 分层超时设计

WorkBuddy For Me 在 shared 包里定义了几个超时常量（`packages/shared/src/constants.ts`）：

```typescript
/** 连接探活超时：快速反馈"Ollama 没开"或"OpenAI key 不对" */
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/** 聊天流式连接超时：专为本地模型冷启动放宽 */
export const CHAT_CONNECT_TIMEOUT_MS = 180_000;  // 3 分钟

/** 普通 JSON 请求（listModels / embed）默认超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
```

然后在两个 HTTP 入口里分别应用：

### openSseChannel：聊天流专用

`openSseChannel` 是所有流式聊天的统一入口（`packages/ai/src/http/sse-channel.ts`）：

```typescript
export async function openSseChannel(url: string, options: SseOpenOptions): Promise<SseChannel> {
  const timeoutMs = options.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS;
  const linked = withTimeout(options.signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...options, signal: linked.signal });
  } catch (error) {
    linked.dispose();
    if (linked.timedOut()) throw ProviderError.timeout(`SSE 连接 ${url}`, timeoutMs);
    // ...其他错误处理
  }

  // 关键：头已到达 → 解除连接超时
  linked.clearTimeout();
  return { response, dispose: () => linked.dispose() };
}
```

注意 `linked.clearTimeout()` 这一行——它在响应头到达的**瞬间**就解除了连接超时。这意味着：

- Ollama 冷启动 30 秒后终于返回响应头 → `clearTimeout` 执行 → 后续流式读取不再受连接超时约束；
- OpenAI 5 秒内返回响应头 → `clearTimeout` 执行 → 同上；
- Ollama 真挂了 → 180 秒后 timeout 触发 → `ProviderError.timeout` 抛出。

Ollama adapter 在调用时显式传入 180 秒超时：

```typescript
// openAiChatStream 里
const { response, dispose } = await openSseChannel(url, {
  timeoutMs: CHAT_CONNECT_TIMEOUT_MS,  // 180_000
  // ...
});
```

而 OpenAI adapter 不传这个参数，走默认值（10 秒）——因为 OpenAI 的冷启动只需要 1-5 秒，10 秒足够覆盖网络抖动。

### fetchJson：普通请求

`fetchJson` 用于 listModels、embed、testConnection 等非流式请求（`packages/ai/src/http/fetch-with-retry.ts`）：

```typescript
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;  // 30 秒
  const maxRetries = options.maxRetries ?? 2;
  // ...指数退避重试循环
}
```

Ollama 的 `ollamaListModels` 调用 `fetchJson` 时**不改超时**——因为列出模型只是在 Ollama 已经启动的情况下返回已缓存的列表，响应是瞬时的（通常 < 500ms），不需要 180 秒。如果 Ollama 根本没开，10 秒内就会 TypeError（ECONNREFUSED），重试 2 次后快速失败。

这就是"分流"的核心：**流式请求（chat）和普通请求（listModels）用不同的超时策略**，各自适配各自的场景特性。

## withTimeout：信号链组合的实现

超时逻辑的底层是 `withTimeout`（`packages/ai/src/http/timeout-signal.ts`），它把外部 AbortSignal 和超时信号"链接"起来：

```typescript
export interface LinkedSignal {
  signal: AbortSignal;          // 合并后的 signal，传给 fetch
  clearTimeout(): void;         // 响应头到达后解除超时
  dispose(): void;              // 取消外部 signal 监听，避免内存泄漏
  timedOut(): boolean;          // 判断当前错误是不是我们自己的超时
}

export function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): LinkedSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let timedOut = false;

  if (external) {
    if (external.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      external.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      }, { once: true });
    }
  }

  const onAbort = () => {
    timedOut = true;
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    clearTimeout: () => clearTimeout(timeoutId),
    dispose: () => {
      clearTimeout(timeoutId);
      controller.signal.removeEventListener('abort', onAbort);
      // 外部 signal 监听不需要显式移除（用了 { once: true }）
    },
    timedOut: () => timedOut,
  };
}
```

几个设计细节：

1. **双信号合并**：`controller.signal` 同时监听"我们自己的超时"和"用户主动取消"两个 abort 源，fetch 只需要接一个 signal。
2. **clearTimeout vs dispose**：`clearTimeout()` 只清除超时定时器（响应头到达后，后续流式读取不需要超时了）；`dispose()` 额外移除事件监听器（避免 LinkedSignal 被 GC 后外部 signal 还持有引用）。
3. **timedOut 判断**：用一个闭包变量标记 abort 是不是由我们的超时触发的。这样在 catch 里可以区分"用户取消"和"我们超时"，返回不同的错误类型。

## 前端体验：加载状态怎么传递

后端 180 秒超时，但前端不应该傻等。WorkBuddy For Me 在 chat UI 里做了两件事：

### 1. 连接探活前置

在聊天设置页面，用户填完 Ollama 地址后，点"测试连接"按钮会立即调用 `listModels`（走普通 30 秒超时）。如果 Ollama 没开，10 秒内就会返回"连接失败"；如果开着但模型还在冷加载，`listModels` 走 `/api/tags`——这个端点**不触发模型加载**（Ollama 会在后台空闲时预加载，但 `/api/tags` 只返回已注册的模型列表）。所以用户在设置页面看到的模型列表永远是瞬时响应的。

### 2. 聊天页面的加载指示

用户发送消息后，前端会立即显示一个"正在思考..."的状态气泡。这个气泡会在**收到第一个 SSE 事件**（meta 或 delta）后消失。如果后端 60 秒内没发任何事件，前端会弹出一个友好的提示："正在等待本地模型加载，首次请求可能需要 30 秒以上"——让用户知道"卡住了是正常的，不是 bug"。

## 冷启动后的预热问题

一个自然的优化想法是：能不能让 Ollama 在空闲时预加载模型，这样第一次请求就不需要等了？

Ollama 提供了 `OLLAMA_KEEP_ALIVE` 环境变量，默认 5 分钟。设置为 `-1` 可以让模型永久驻留内存。但这个策略有两个问题：

1. **内存占用**：7B 模型占 ~4GB RAM/显存，14B 占 ~8GB。用户同时开多个应用时，内存压力大。
2. **不是所有用户都用 Ollama**：云端用户不需要预热；用 Ollama 的用户里，也不是所有人都愿意常驻内存。

v0.2 没有做自动预热——冷启动的体验退化只发生在**应用刚打开、用户第一次发消息**时，之后模型在 Ollama 里被 keep-alive 缓存住（默认 5 分钟），后续请求都是热启动（TTFT < 1s）。这个 trade-off 目前可以接受。v0.3 如果要做，可以加一个可选的"启动时预加载模型"选项。

## chat vs completion：端点选择

WorkBuddy For Me 在 provider 层面只暴露一个 `chatStream` 方法。但历史上（2023 年末，function calling 刚出来时），不少模型供应商把"普通对话"和"带工具的对话"分成了 `/chat/completions` 和 `/completions` 两个端点。现在主流 provider（OpenAI、Anthropic、Ollama）都统一用 `/chat/completions` 了，`/completions` 是旧版遗留。

Ollama 的情况稍微特殊一点：

| 端点 | 用途 | 流式支持 | 工具调用 |
|------|------|----------|----------|
| `/api/generate` | 旧版 completion | 是 | 否 |
| `/api/chat` | 原生 chat | 是 | 是（Ollama 0.3+） |
| `/v1/chat/completions` | OpenAI 兼容 | 是 | 是（Ollama 0.3+） |

v0.2 统一走 `/v1/chat/completions`，不碰 `/api/generate`（没有 tools），也不直接走 `/api/chat`（跟 `/v1` 功能重复，白白多写一套 adapter）。这个分流在 adapter 注册时就固定了——provider 类型决定了用什么端点，上层 orchestrator 不感知。

## 小结

本地模型冷启动的核心矛盾是：**HTTP 客户端用同一个 fetch 同时适配云端（5 秒超时）和本地（30-60 秒 TTFT）的场景**。

WorkBuddy For Me 的解法：

| 问题 | 方案 |
|------|------|
| 连接超时太长误伤云端 | 按请求类型分层：聊天流 180 秒，普通请求 30 秒 |
| 超时信号与用户取消信号冲突 | `withTimeout` 把两个信号合并成一个 `controller.signal` |
| 响应头到达后还被超时限制 | `clearTimeout()` 在收到头的瞬间解除连接超时 |
| 用户不知道在等什么 | 前端"正在思考..."气泡 + 60 秒后的冷启动提示 |
| 预热 vs 内存占用 | v0.2 不做自动预热，依赖 Ollama 默认 5 分钟 keep-alive |

这套机制上线后，本地 Ollama 用户的首次请求在冷启动期间不会被误杀（180 秒足够覆盖 14B 模型加载），云端 OpenAI 用户的"provider 挂了"也能在 10 秒内快速反馈。B06 会转到下一个话题：LangSmith 追踪怎么不侵入业务代码。
