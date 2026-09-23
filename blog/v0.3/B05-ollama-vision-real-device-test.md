---
title: "Ollama 视觉模型真机踩坑：image_url data URL 直传 vs 原生 /api/chat images"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B05"
tags: ["workbuddy", "ollama", "multimodal", "vision", "qwen2.5vl"]
date: "2025-Q4"
---

## 背景：v0.2 的 Ollama 适配

v0.2 里 Ollama 的适配策略很清晰——**走内置的 OpenAI 兼容端点**（`/v1/chat/completions`），这样我们只需要一个适配器（openai），Ollama / LM Studio / llama.cpp 全部吃同一个协议。

```typescript
// packages/ai/src/adapters/ollama/adapter.ts
export function createOllamaAdapter(connection: ProviderConnection): ChatProvider {
  const openAi = createOpenAiCompatibleAdapter({
    ...connection,
    baseUrl: normalizeOllamaBaseUrl(connection.baseUrl),  // → http://localhost:11434/v1
  });
  return {
    supportsTools: true,
    testConnection: async (signal) => { await ollamaListModels(connection, signal); },
    chatStream: openAi.chatStream,       // 直接复用
    embed: openAi.embed,                 // 直接复用
    listModels: (signal) => ollamaListModels(connection, signal),
  };
}
```

这个设计的好处是：**新模型自动兼容**。只要 Ollama 在 `/v1/chat/completions` 端点上实现了某能力，我们不用改代码就能用。

问题是——视觉模型的 `/v1/chat/completions` 到底支不支持 `image_url`？这在 v0.3 写 M1 之前是个问号。

---

## 第一波尝试：怀疑，加兼容层

Ollama 自己有原生的 `/api/chat` 端点，它的请求体结构和 OpenAI 兼容端点完全不同：

```json
// Ollama 原生 /api/chat
{
  "model": "qwen2.5vl:7b",
  "messages": [
    {
      "role": "user",
      "content": "这是什么？",
      "images": ["base64..."]     // ← 原生格式：顶层 images 数组，base64 无 data URL 前缀
    }
  ],
  "stream": true
}
```

对比 OpenAI 兼容格式：

```json
// OpenAI /v1/chat/completions
{
  "model": "qwen2.5vl:7b",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "这是什么？" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "stream": true
}
```

两个结构差异巨大。在 v0.3 M1 开发前期，我们做了一个保守的假设：**Ollama 的 `/v1/chat/completions` 端点对多模态的支持可能不完整**，需要回退到原生 `/api/chat`。所以写了一个兼容层：

```typescript
// ❌ 早期代码（后来删除）
function toOllamaNative(messages: ChatMessage[]): any[] {
  return messages.map(msg => {
    const images: string[] = [];
    const textParts: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'image_url') {
          // 把 data URL 前缀剥掉，只留纯 base64
          images.push(part.image_url.url.replace(/^data:[^;]+;base64,/, ''));
        } else if (part.type === 'text') {
          textParts.push(part.text);
        }
      }
    } else {
      textParts.push(msg.content ?? '');
    }
    const result: any = { role: msg.role, content: textParts.join('\n') };
    if (images.length > 0) result.images = images;
    return result;
  });
}
```

然后在 adapter 里加条件分支：

```typescript
// ❌ 早期代码
if (provider.type === 'ollama') {
  body.messages = toOllamaNative(messages);
  body.stream = true;
  // 走 /api/chat 而不是 /v1/chat/completions
} else {
  body.messages = messages;   // 标准 OpenAI 格式
}
```

写了大概 80 行转换代码，引入了一个新的 adapter 分支点。

---

## 真机实测：直接用 data URL，通了

2026 年 5 月（v0.3 Beta），我们在一台本地跑 Ollama 的机器上做了完整的真机测试。qwen2.5vl:7b 已经 pull 好，`/api/tags` 能看到它。

测试脚本（简化版）：

```bash
# 直接调 /v1/chat/completions，用 OpenAI image_url data URL 格式
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5vl:7b",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "这张图的主色调是什么？" },
          { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
        ]
      }
    ]
  }'
```

测试图是一张纯色的 #3498DB 蓝色方块 PNG（base64 大概 12KB，小图）。

预期：400 或不认识 `image_url` 字段。
实际：**正确返回了「蓝色，十六进制接近 3498DB」**。而且 `prompt_tokens` 计数明显比纯文本请求高（图像被正确计入 token）。

后续又测了：
- 一张有多种颜色的截图 → 正确描述了色彩分布
- 一张文字截图 → 能读出文字内容（中文 OCR 效果中等）
- 纯 data URL（不是图片，是一段 base64 文本）→ 模型正确判断「这不是图片」
- 混合图片 + 文字（图片是蓝色方块 + prompt 是「图是什么颜色」）→ 正确回答
- 多轮对话（先看图，再追问「上一张图里有什么」）→ Ollama 自动保留了历史图片上下文（这一点比我们预期的还强）

**结论**：Ollama 0.4 + qwen2.5vl:7b 完全支持 OpenAI 兼容端点上的 `image_url` data URL 格式，不需要转原生格式。

---

## 清理兼容层代码

既然实测通了，那 80 行转换代码和条件分支就成了 dead code。删掉：

```typescript
// ✅ 最终代码（adapter.ts）
export function createOllamaAdapter(connection: ProviderConnection): ChatProvider {
  const openAi = createOpenAiCompatibleAdapter({
    ...connection,
    baseUrl: normalizeOllamaBaseUrl(connection.baseUrl),
  });

  return {
    supportsTools: true,
    testConnection: async (signal) => { await ollamaListModels(connection, signal); },
    listModels: (signal) => ollamaListModels(connection, signal),
    chatStream: openAi.chatStream,   // 完全复用
    embed: openAi.embed,            // 完全复用
  };
}
```

adapter.ts 从原来的 40 多行 + 条件分支，简化回 20 多行，**视觉和非视觉走同一个路径**。测试脚本 `chat-stream.test.ts` 在 mock provider 里加了一个视觉 case，真实 provider 用 e2e/手动测试覆盖。

### 为什么写这个注释保留下来了

```typescript
// v0.3 视觉：视觉消息（image_url data URL）经 /v1 透传。
// M1 真机实测（Ollama + qwen2.5vl:7b，2026-05）：/v1/chat/completions
// 正确消费 data URL 图片（纯色图被准确描述、prompt_tokens 含图像），
// 因此无需转原生 /api/chat 的 images 字段。
```

留这段注释有两个原因：
1. **给后人看**——万一以后 Ollama 改了兼容端点的行为，有人看到这段注释就知道当时的决定是实测支撑的
2. **作为测试记录**——版本号 + 模型号 + 日期都标清楚了，复现环境

---

## 真机测试发现的另外两个点

### 发现 1：qwen2.5vl 不支持工具调用，但支持视觉

qwen2.5vl 在 Ollama 上的实际行为是：
- `/v1/chat/completions` 带 `image_url` → 正确处理 ✅
- `/v1/chat/completions` 带 `tools` → 400 报错 ❌

这个事实直接导致了 B06 里要讲的 `runProviderTurnWithToolFallback`——模型声明了 `capabilities: ['vision']`，assistant 可能开了工具调用，但一发请求就被 400 打回。必须 fallback。

### 发现 2：Ollama 的 vision prompt_tokens 不算进 usage

Ollama 返回的 `usage.prompt_tokens` 包含文本 token，但**图像 token 是 Ollama 内部算的，不对外暴露**。所以我们在 UI 上显示 token 用量时，视觉对话的 token 数会**偏低**——这是 Ollama 本身的限制，不是我们的 bug。`usage` 里只信任 provider 给的数字，不自行修正。

---

## 对比其他 provider

在 qwen2.5vl 上实测之后，我们也测了其他 provider：

| Provider | 视觉端点 | 格式 | 备注 |
|----------|----------|------|------|
| Ollama (qwen2.5vl) | `/v1/chat/completions` | `image_url` data URL ✅ | 完全兼容 |
| OpenAI GPT-4o | `/v1/chat/completions` | `image_url` data URL ✅ | 原生就用这个格式 |
| LM Studio | `/v1/chat/completions` | 取决于后端模型 | qwen2.5vl 后端和 Ollama 一样通 |
| llama.cpp | `/v1/chat/completions` | 取决于后端模型 | 部分模型不支持 |
| Anthropic | 不兼容 OpenAI 端点 | 独立 adapter | 我们没实现 |

结论：**所有走 OpenAI 兼容端点的 provider，都统一用 `image_url` data URL 格式**。这让整个多模态 wire 逻辑只写一套。

---

## 小结

这次真机测试给了我们两个重要教训：

1. **不要太早写兼容层**——看到原生协议和兼容协议结构不同，第一反应不一定是「需要转换」，而是「先拿真机测一下兼容端点到底支不支持」。Ollama 既然提供了 OpenAI 兼容端点，大概率是想让你把它当 OpenAI 用的。
2. **adapter 分支点越少越好**——我们在 v0.2 的经验就是：adapter 里的 `if (provider.type === 'ollama')` 迟早会变成维护负担。这次删掉视觉转换代码，Ollama adapter 回到了一行 chatStream 透传，代码回到了 v0.2 的简洁度。

这个坑的完整链路是：**先怀疑 → 写兼容层 → 真机实测 → 发现兼容端点直接支持 → 删兼容层 → 留下注释**。代码量从 80+ 行降到 20 行，同时获得了更强的跨 provider 一致性。

下一篇 B06 讲另一个真机坑的直接后果：模型不支持工具调用时的优雅降级——`runProviderTurnWithToolFallback`。
