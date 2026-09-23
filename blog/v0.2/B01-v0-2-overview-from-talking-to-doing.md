---
title: "v0.2 总览：从「只会说」到「会动手」——WorkBuddy For Me 的工具调用链架构升级"
series: "WorkBuddy For Me v0.2 技术拆解"
number: "B01"
tags: ["workbuddy", "tools", "architecture"]
date: "2025-Q4"
---

# v0.2 总览：从「只会说」到「会动手」

## 问题：v0.1 的瓶颈

v0.1 的 WorkBuddy For Me 是一个典型的 RAG 问答助手：接收用户输入，拼 system prompt + 历史消息 + 检索片段，调用模型，把流式文本吐给前端。这条链路在"有知识库约束"的场景下够用，但一旦用户的问题超出了知识范围——比如"今天几号"、"帮我查一下这个网页的内容"、"我想不起知识库里关于 X 的那段描述了"——助手就只能摇头说"我不知道"。

v0.1 的代码结构本身就透露了这个限制。chat orchestrator 的核心循环只有一件事：拼消息 → 调 provider → 转发 delta。`streamChat` 是个干净的单次调用，没有任何"模型输出 → 执行 → 结果回灌 → 再调用"的迭代空间。模型是唯一的信息源，知识库是唯一的外部上下文，前端只消费文本流。

要让助手"会动手"，本质上需要两件事：**模型能声明"我想执行什么"**，以及**应用能接住这个声明、执行、把结果喂回去**。前者是 tool calling（OpenAI 2023 年底引入、此后主流模型纷纷对齐的 function calling 协议），后者是工具编排器——v0.2 的全部复杂度几乎都堆在这里。

## 设计目标与约束

动手之前，先把边界画清楚。WorkBuddy For Me 是个人/小团队用的本地优先（local-first）桌面应用，这几个事实直接决定了设计取舍：

- **模型不一定支持 function calling**：用户可能接的是 Ollama 跑的 qwen2.5:7b，也可能是云端 OpenAI。协议层必须兼容两端，不支持的情况下优雅降级。
- **工具必须只读**：v0.2 不上文件系统写入、不上 shell 命令。`fetch_webpage`、`knowledge_search`、`current_time` 三个内置工具覆盖"查网页 → 查知识库 → 查时间"的闭环，其余操作留到后续版本。
- **工具链不能死循环**：模型拿到结果后可能再次调用工具，也可能直接出最终文本。硬上限（默认 8 轮）+ 达到上限时的 fallback 文本，保证一次对话的执行时间可预测。
- **SSE 是唯一的流协议**：前后端通过 Next.js Route Handler + `response.write()` 发 SSE，事件序列必须稳定：`meta`（消息 ID）→ 若干轮 `tool.start` / `delta` / `tool.end` → `citations`（可选）→ `done` 或 `error`。

## 整体架构一览

升级后的 chat orchestrator 不再是单次调用，而是一个迭代循环。核心骨架（简化自 `packages/core/src/chat/chat-orchestrator.ts`）长这样：

```typescript
// packages/core/src/chat/chat-orchestrator.ts（简化）
export async function* streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
  // 1. 准备：解析模型、准备用户消息、落库 assistant 消息占位
  yield { event: 'meta', data: { messageId, conversationId } };

  // 2. 构建工具 runtime（按助手白名单过滤）
  const toolMap = runtime.buildTools(assistant, target.provider.supportsTools);
  const toolDefs = toToolDefinitions([...toolMap.values()]);
  const toolCtx = runtime.createContext(assistant, signal);

  // 3. 多轮迭代：最多 MAX_TOOL_ROUNDS 轮
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // 调 provider，获取文本增量 + 工具调用声明
    const outcome = await runProviderTurn(params);

    // 转发 delta 给前端
    for (const step of outcome.deltas) yield step;

    // 如果模型没声明工具调用，直接结束本轮
    if (outcome.toolCalls.length === 0) break;

    // 执行所有工具，结果追加到 outgoing messages
    for (const call of outcome.toolCalls) {
      yield { event: 'tool', data: { phase: 'start', ... } };
      const result = toolMap.get(call.name).run(args, toolCtx);
      yield { event: 'tool', data: { phase: 'end', ...result } };
      outgoing.push({ role: 'tool', content: result.output, toolCallId: call.id });
    }
  }

  yield { event: 'done', data: { content: full, usage } };
}
```

这个循环里藏着几个关键设计决策，后续文章会逐个展开：

1. **工具注册与执行分离**：`ToolRuntime` 负责"按助手白名单构建可用工具映射"和"构造执行上下文"，`ToolExecutor` 负责"执行一次调用 + 归一化结果（含超时/参数错误）"。两者分开是为了让工具本身保持纯函数（`run(rawArgs, ctx) → ToolResult`），便于测试和替换。

2. **Provider 层对工具的透明降级**：`runProviderTurnWithToolFallback` 先尝试带 `tools` 参数调用，收到"不支持 tools"的错误后自动去掉 tools 再重试——这样同一个助手在 OpenAI 和 Ollama 上都能工作，只是后者不会触发工具。

3. **SSE 事件驱动而非轮询**：工具执行过程（start → 执行 → end）被拆成两个事件，前端据此渲染"工具卡片正在跑"的视觉反馈，而不是等工具跑完才一次性吐给前端。这对 `fetch_webpage` 这种可能耗时 5-10 秒的工具特别重要。

4. **LangSmith 追踪零侵入**：通过环境变量开关 + `traceAsync` 包装器，tool 执行、RAG 检索、模型调用全链路自动埋点，不需要业务代码改一行。关闭追踪时代码路径完全不感知。

## 三个内置工具的实现思路

v0.2 提供三个只读工具，它们覆盖了最常见的"回答不了"场景：

| 工具名 | 能力 | 外部依赖 |
|--------|------|----------|
| `current_time` | 返回当前时区时间 | 无（纯函数） |
| `knowledge_search` | 跨知识库向量检索 | SQLite + sqlite-vec（通过 `ToolContext.retrieve` 回调） |
| `fetch_webpage` | 抓网页正文（只读） | HTTP + SSRF 防护层 |

每个工具的统一接口定义在 `packages/core/src/tools/types.ts`：

```typescript
export interface Tool {
  name: ToolName;
  description: string;          // 给模型看的描述
  parameters: Record<string, unknown>;  // JSON Schema（OpenAI function-calling 格式）
  run(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;        // 执行是否成功
  output: string;     // 回灌模型的文本
  summary: string;    // UI 展示用（≤120 字）
  citations?: Citation[];  // knowledge_search 时附带角标
}
```

注意 `ToolContext` 的设计：工具**不直接访问数据库**，所有数据面操作通过回调注入。`knowledge_search` 需要检索能力？编排器把 `retrieve(query, topK, signal)` 塞进去。这样工具单元测试时只要 mock 一个 `retrieve` 就行，不需要起 SQLite。

```typescript
// packages/core/src/tools/tool-runtime.ts
export function createToolRuntime(deps: ServiceDeps): ToolRuntime {
  const retrieval = createRetrievalService(deps);
  return {
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

## 模型能力探测与门控

不是所有模型都支持工具调用。v0.2 有两道门控：

**第一道：Provider 级**。每个 adapter 返回 `supportsTools: boolean`。Ollama adapter 固定 `true`（因为 Ollama 0.3+ 的 `/v1/chat/completions` 兼容端点确实支持 tools），但不代表具体模型支持。

**第二道：调用级降级**。`runProviderTurnWithToolFallback` 捕获 400 错误中的 "does not support tools" 关键词，去掉 tools 参数重试：

```typescript
// packages/core/src/chat/tool-runner.ts
export async function* runProviderTurnWithToolFallback(params: TurnParams) {
  if (params.tools.length === 0) return yield* runProviderTurn(params);
  try {
    return yield* runProviderTurn(params);
  } catch (error) {
    if (!isToolsUnsupportedError(error)) throw error;
    // 模型不支持工具声明，退化为纯文本调用
    return yield* runProviderTurn({ ...params, tools: [] });
  }
}
```

这种"先试后降级"的策略比预先探测更靠谱，因为模型能力是动态的（同一个 provider 下不同模型能力不同），而报错信息里通常直接包含了"不支持 tools"的字样。

## 安全红线

v0.2 上了工具就等于打开了新的攻击面。三个工具里最危险的是 `fetch_webpage`——如果模型被诱导去请求内网地址（比如 `http://169.254.169.254/latest/meta-data/`），桌面应用跑在用户机器上，等于把本地网络暴露给了云端模型的输出。

SSRF 防护实现在 `packages/core/src/tools/ssrf-guard.ts`，分两层：

1. **URL 字面量校验**：协议白名单（仅 http/https）+ 主机名为 IP 字面量时直接判定是否命中私网段。
2. **DNS 解析校验**：主机名为域名时，`dns.lookup({ all: true })` 拿到所有解析结果，逐个判定是否公网。

两层都通过才放行。白名单覆盖了 127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、169.254.0.0/16、0.0.0.0/8、224.0.0.0/4、240.0.0.0/4、CGNAT、TEST-NET 全部保留段等。IPv6 同样覆盖了 fc00::/7（唯一本地）、fe80::/10（链路本地）、ff00::/8（多播）以及 IPv4-mapped 尾部的内嵌 v4 判定。

## 本系列后续文章

这篇是全景图。后续文章按"底层 → 协议 → 运行时 → 安全 → 工程"的顺序展开：

| 编号 | 主题 | 关键词 |
|------|------|--------|
| B02 | 从零实现工具调用的完整 TS 流程 | schema 注册、tool_calls 解析、result 回传 |
| B03 | SSE 事件流里塞工具过程的时序编排 | meta→tool_call→tool_result→delta 的前端可见性 |
| B04 | 接入 Ollama 的真实代价 | OpenAI 兼容接口 vs 原生 /api/chat、流式差异 |
| B05 | 本地模型冷启动痛点 | 首 token 延迟、连接超时、端点分流 |
| B06 | LangSmith 追踪的 AOP 包装与四层测试 | traceAsync、mock 注入、零侵入 |
| B07 | 消息重生成的正确姿势 | cursor 回溯、contentParts 保留、并发安全 |
| B08 | 工具调用链的安全红线 | SSRF 防护、文件系统白名单、命令沙箱 |
| B09 | 工程约束的三层门禁 | TS strict + 单文件≤300行 + 外部调用 mock |
| B10 | v0.1→v0.2 的架构债盘点 | 哪些能还、哪些留给 v0.3 |

如果你是直接跳到这一篇的，建议先看这篇建立整体认知，再按编号顺序读后续——每篇独立可读，但组合起来是一条完整的实现路径。
