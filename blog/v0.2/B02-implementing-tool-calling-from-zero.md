---
title: "从零实现工具调用：schema 注册、LLM tool_calls 解析、result 回传的完整 TypeScript 流程"
series: "WorkBuddy v0.2 技术拆解"
number: "B02"
tags: ["tools", "typescript", "function-calling"]
date: "2025-Q4"
---

# 从零实现工具调用

## 为什么需要工具调用

在 v0.1 里，模型的唯一输出是文本，助手的唯一动作是"把文本吐给前端"。这条链路的核心矛盾在于：**模型没有办法在生成过程中"做决定"**——比如用户说"今天几号"，模型要么瞎编一个日期，要么说"我不知道"，因为它不知道今天到底是 2026 年的哪一天。

Function calling（工具体调用）解决的就是这个问题。它不是让模型真的去执行函数，而是让模型**声明**它想调用哪个函数、传什么参数。应用端拿到这个声明，真的去执行函数，把执行结果塞回对话历史，再让模型接着生成。一轮完整的调用链长这样：

```
[
  {role: 'user', content: '今天几号？'},
  {role: 'assistant', content: null, tool_calls: [
    {id: 'call_abc', function: {name: 'current_time', arguments: '{}'}}
  ]},
  {role: 'tool', tool_call_id: 'call_abc', content: '2026-09-22 11:00:00 Asia/Shanghai'}
]
```

模型看到最后一条 tool 消息后，就知道"哦，真的日期是 9 月 22 日"，接下来就可以生成自然语言回答了。

## 第一步：定义 Tool 接口

我们先写一个最小可用的 Tool 接口，放在 `packages/core/src/tools/types.ts`：

```typescript
import type { ToolDefinition } from '@wbfm/ai';

/** 工具执行时可使用的能力（由编排器注入） */
export interface ToolContext {
  signal?: AbortSignal;
  knowledgeBaseId: string | null;
  retrieve: (query: string, topK: number, signal?: AbortSignal) => Promise<RetrievedChunk[]>;
}

/** 工具执行结果 */
export interface ToolResult {
  ok: boolean;
  output: string;       // 回灌模型的完整文本
  summary: string;       // UI 展示用（裁剪过）
  citations?: Citation[];
}

/** 一个可注册的工具 */
export interface Tool {
  name: ToolName;
  description: string;   // 给模型看的描述（好的描述能显著提高工具被正确调用的概率）
  parameters: Record<string, unknown>;  // JSON Schema，OpenAI function-calling 格式
  run(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/** 把 Tool[] 转成模型能识别的 ToolDefinition[] */
export function toToolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
```

几个设计要点：

- **ToolContext 是可注入的**：工具本身不 import 任何 service，所有外部能力（检索、信号、知识库 ID）都通过 `ctx` 传入。这意味着单元测试时你可以 mock 一个 ctx，不需要起数据库或 HTTP server。
- **ToolResult 分 output 和 summary**：output 可能很长（`fetch_webpage` 抓回的网页正文可能几千字），直接塞给 UI 会炸。summary 是裁剪过的版本，用于工具卡片的即时展示。
- **JSON Schema 硬编码**：`parameters` 字段直接写 JSON Schema 对象，而不是用 zod/valibot 之类的 runtime validator。原因很简单——这个 schema 主要给模型看（告诉它参数长什么样），真正的校验在执行前我们会手动做一层，没必要再引一个 runtime 依赖。

## 第二步：实现一个具体工具

以最简单的 `current_time` 为例，看看一个 Tool 的完整实现（`packages/core/src/tools/current-time-tool.ts`）：

```typescript
import type { Tool, ToolResult } from './types';

export const currentTimeTool: Tool = {
  name: 'current_time',
  description: '返回当前日期和时间（含时区）。用户问"今天几号"、"现在几点"等时机使用。',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA 时区名，如 "Asia/Shanghai"。缺省时使用系统默认时区。',
      },
    },
    required: [],
  },

  async run(rawArgs): Promise<ToolResult> {
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    const tz = typeof args.timezone === 'string' ? args.timezone : undefined;

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZoneName: 'short',
      });
      const text = formatter.format(now);
      return {
        ok: true,
        output: `当前时间：${text}`,
        summary: `当前时间：${text}`,
      };
    } catch (error) {
      // Intl 构造器可能因非法时区名抛 RangeError
      return {
        ok: false,
        output: `current_time 执行失败：${error instanceof Error ? error.message : String(error)}`,
        summary: '执行失败',
      };
    }
  },
};
```

几个可以借鉴的细节：

1. **description 里直接写使用时机**："用户问'今天几号'、'现在几点'等时机使用"——这种句式比抽象的"返回当前时间"让模型更容易判断什么时候该调。
2. **参数做类型收窄**：`rawArgs` 在 JSON.parse 后类型是 `unknown`，我们显式检查 `typeof args.timezone === 'string'` 才使用。
3. **时区名可能非法**：`Intl.DateTimeFormat` 遇到未知 IANA 名会抛 `RangeError`，必须 try-catch。

## 第三步：参数解析与执行器

模型传来的 `tool_calls[].function.arguments` 是 **JSON 字符串**（注意不是已经 parse 过的 object）。我们需要一个执行器来统一处理"解析参数 → 超时控制 → 归一化结果"。

核心实现在 `packages/core/src/tools/tool-executor.ts`：

```typescript
/** 解析工具调用的 JSON 参数；非法 JSON 抛 ToolArgError */
export function parseToolArgs(call: { function: { arguments: string } }): unknown {
  const raw = call.function.arguments?.trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ToolArgError('参数不是合法 JSON');
  }
}

/** 执行一次工具调用：参数错误/执行异常/超时均归一为 ToolResult */
export async function executeToolCall(
  tool: Tool,
  rawArgs: unknown,
  ctx: ToolContext,
  timeoutMs: number = TOOL_TIMEOUT_MS,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    // 合并用户中断信号与超时信号
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, timeoutSignal])
      : timeoutSignal;
    const result = await tool.run(rawArgs, { ...ctx, signal });
    return {
      ok: result.ok,
      output: result.output,
      summary: clipSummary(result.summary || result.output),
      ...(result.citations ? { citations: result.citations } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (error instanceof ToolArgError) {
      // 参数错误：让模型看到具体原因，给一次自我纠正机会
      return {
        ok: false,
        output: `工具 ${tool.name} 参数错误：${error.message}。请检查参数后重试，或直接回答用户。`,
        summary: `参数错误：${error.message}`,
      };
    }
    const aborted = ctx.signal?.aborted;
    const timedOut = durationMs >= timeoutMs;
    const reason = aborted
      ? '用户已中断'
      : timedOut
        ? `执行超过 ${timeoutMs / 1000}s 超时`
        : '执行失败';
    return {
      ok: false,
      output: `工具 ${tool.name} ${reason}：${error instanceof Error ? error.message : String(error)}`,
      summary: reason,
    };
  }
}
```

这里有个有趣的设计选择：**ToolArgError 是一个"可以让模型看到详情"的错误**。如果模型生成了非法 JSON，我们不只是吞掉错误，而是把具体原因塞到 output 里回灌模型。模型看到"参数不是合法 JSON"，下次就会改对——这是一种简单但有效的自我纠正机制。

另一个关键点是 **AbortSignal.any 的组合**。Node 18+ 内置了 `AbortSignal.any`，可以把多个 signal 合并成一个。这样工具内部如果用了 fetch，只要 `fetch(url, { signal })` 接上，就能同时响应用户中断和超时限制。

## 第四步：运行时（Runtime）与助手白名单

不是所有助手都应该能用所有工具。一个只做问答的助手不需要 `fetch_webpage`，一个不绑定知识库的助手调用 `knowledge_search` 只会返回空。所以我们需要一个运行时来"按助手配置构建可用工具映射"。

这层在 `packages/core/src/tools/tool-runtime.ts`：

```typescript
const ALL_TOOLS: Record<ToolName, Tool> = {
  current_time: currentTimeTool,
  knowledge_search: knowledgeSearchTool,
  fetch_webpage: fetchWebpageTool,
};

export interface ToolRuntime {
  buildTools(assistant: Assistant, supportsTools: boolean): ToolMap;
  createContext(assistant: Assistant, signal?: AbortSignal): ToolContext;
}

export function createToolRuntime(deps: ServiceDeps): ToolRuntime {
  const retrieval = createRetrievalService(deps);
  return {
    buildTools(assistant, supportsTools) {
      // 模型不支持 tools → 返回空映射（调用方会走纯文本路径）
      if (!supportsTools || assistant.enabledTools.length === 0) return new Map();
      const map = new Map<ToolName, Tool>();
      for (const name of assistant.enabledTools) {
        map.set(name, ALL_TOOLS[name]);
      }
      return map;
    },

    createContext(assistant, signal) {
      return {
        signal,
        knowledgeBaseId: assistant.knowledgeBaseId,
        retrieve: (query, topK, retrieveSignal) =>
          retrieval.retrieve({
            knowledgeBaseId: assistant.knowledgeBaseId ?? '',
            query, topK: topK || DEFAULT_RETRIEVAL_TOP_K, signal: retrieveSignal,
          }),
      };
    },
  };
}
```

两个方法各司其职：

- `buildTools`：根据助手白名单 + 模型能力，返回 `ReadonlyMap<ToolName, Tool>`。返回 Map 而不是数组，是因为后续执行时需要按名字 O(1) 查找。
- `createContext`：把 retrieval service 闭包捕获后，变成一个 `retrieve` 回调注入 ToolContext。工具本身完全不依赖 ServiceDeps。

## 第五步：在 Chat Orchestrator 里串联

到这一步，各个零件已经就绪。现在把它们串进 orchestrator 的主循环里（`packages/core/src/chat/chat-orchestrator.ts` 的简化版）：

```typescript
async *streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
  // ...前面省略准备工作...

  // 构建工具定义，注入到 provider 调用
  const toolMap = runtime.buildTools(assistant, target.provider.supportsTools);
  const toolDefs = toToolDefinitions([...toolMap.values()]);
  const toolCtx = runtime.createContext(assistant, input.signal);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // 调 provider，把 tools 定义发过去
    const outcome = await runProviderTurnWithToolFallback({
      target,
      messages: outgoing,
      tools: toolDefs,
      signal: input.signal,
    });

    // 转发文本增量
    for (const step of outcome.deltas) yield step;

    // 没有工具调用声明 → 结束循环
    if (outcome.toolCalls.length === 0) break;

    // 本轮 assistant 消息里已包含 tool_calls，追加到 outgoing
    outgoing.push({ role: 'assistant', content: outcome.content || null, toolCalls: outcome.toolCalls });

    // 逐个执行工具
    for (const call of outcome.toolCalls) {
      yield { event: 'tool', data: { phase: 'start', callId: call.id, tool: call.name } };

      const tool = toolMap.get(call.function.name);
      const args = parseToolArgs(call);
      const result = tool
        ? await executeToolCall(tool, args, toolCtx)
        : { ok: false, output: `未知工具：${call.function.name}`, summary: '未知工具' };

      yield { event: 'tool', data: { phase: 'end', result } };

      // 把 tool 结果追加到 outgoing，供下一轮模型调用消费
      outgoing.push({
        role: 'tool',
        content: result.output,
        toolCallId: call.id,
        name: call.function.name,
      });
    }
  }

  yield { event: 'done', data: { content: full } };
}
```

## 常见坑与解决方案

### 坑 1：arguments 是 JSON 字符串不是 object

很多接 OpenAI 兼容 API 的开发者第一次碰到都会被坑：`tool_calls[].function.arguments` 是 **string**，你需要自己 JSON.parse。更坑的是，Ollama 的早期版本在流式返回 tool_call 时可能会把 arguments 拆成几个 chunk——这时候你需要等整个 tool_call 结束再拼起来 parse。WorkBuddy 的 OpenAI 兼容 adapter 做了一个 buffer，等同一个 tool_call 的所有增量到齐后才 resolve 完整对象，这个细节在 B03 讲 SSE 流的时候会展开。

### 坑 2：模型可能声明不存在的工具

理论上模型只会声明我们下发过的工具（因为 JSON Schema 是我们给的），但实际中可能出现两种情况：

- 模型幻觉了一个工具名（比如它"记得"某个常见工具体的名字，但我们没给）；
- 模型大小写不一致（比如写了 `CurrentTime` 而不是 `current_time`）。

WorkBuddy 的处理是 **toolMap.get 失败就返回一个 ok:false 的 ToolResult**，output 里写清楚"工具未启用或不存在"。模型看到这个错误信息后，通常会放弃用工具直接回答。

### 坑 3：工具结果太长撑爆 token 窗口

`fetch_webpage` 抓回的正文可能有几万字符。直接塞给模型会占用大量 context，甚至超过模型的上下文窗口。

WorkBuddy 的做法是 **在执行器层面裁剪 output**——但这个决定目前留给每个工具自己处理。`fetch_webpage` 内部用 `turndown` 转 markdown 后截断到 4000 字符，`knowledge_search` 只返回 topK 个 chunk。工具本身负责保证 output 可控，执行器只额外负责 summary 裁剪。

### 坑 4：MAX_TOOL_ROUNDS 的取值

默认设为 8 轮。这个数字的来源是：实际观察发现，绝大多数"工具链"在 2-3 轮就结束了（查时间 → 直接回答；查网页 → 总结 → 回答）。8 轮是一个非常宽松的上限，同时保证一次对话的最坏执行时间可预测（每个工具超时 15s × 8 轮 = 120s）。

达到上限时的 fallback 文本是一句中性的"工具调用已达上限，以下是综合已有信息的回答"——不报错，让模型基于已有的 tool 结果直接出最终回答。

## 小结

工具调用的本质是一个简单协议：**模型声明 → 应用执行 → 结果回灌 → 模型继续**。但实现起来需要处理十几个边角情况：JSON 解析失败、工具不存在、参数错误、执行超时、用户中断、结果过长撑爆 token 窗口。

WorkBuddy 把这些处理分散在三个层次：

| 层次 | 职责 | 位置 |
|------|------|------|
| Tool 接口 | 纯函数执行 + 自己的参数校验 | `packages/core/src/tools/types.ts` |
| ToolExecutor | 统一参数解析、超时、错误归一化 | `packages/core/src/tools/tool-executor.ts` |
| ToolRuntime | 白名单构建、执行上下文注入 | `packages/core/src/tools/tool-runtime.ts` |

这三层的好处是：每一层都可以独立单测（Tool 单测不用考虑 runtime，runtime 单测不用考虑 executor），替换实现也不影响上下游。B03 会接着讲：这些工具事件是怎么被塞进 SSE 流、让前端实时看到"工具正在跑"的。
