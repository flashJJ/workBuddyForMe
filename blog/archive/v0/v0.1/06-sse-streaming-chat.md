# SSE 流式对话全链路：从上游 chunk 到前端打字机

对话产品最伤体验的一件事：用户发完消息，盯着空白屏幕等好几秒，模型才把整段回答一次性吐出来。流式输出解决的就是这个问题——模型每生成一个 token 就推一个增量，前端边收边渲染，等待感从「卡住了」变成「它在写」。

这篇把这个本地 AI 应用的流式链路完整拆开：事件怎么设计、后端怎么用异步生成器逐块转发、用户中途停止时已生成内容怎么保住、上游 SSE 的半包怎么解析。

## 为什么选 SSE 而不是 WebSocket

流式对话是**服务器单向推送**的典型场景：客户端发一个请求，服务端持续回推文本，没有双向互发的需求。SSE（Server-Sent Events）就是干这个的——它就是一个带特定 content-type 的 HTTP 流，能直接复用现有的鉴权、错误码和 HTTP 基础设施，不需要引入长连接网关。

## 全链路一览

```text
用户输入
  ↓
POST /api/chat/stream (SSE)
  ↓
core: chatOrchestrator.streamChat()
  ↓
ai: provider.chatStream() → 上游 SSE
  ↓
逐 chunk 产出 OrchestratorEvent
  ↓
Route Handler 转成 SSE wire 格式
  ↓
前端 fetch + ReadableStream 解析
  ↓
React 状态更新 → 打字机渲染
```

## SSE 事件设计

整条流定义 5 种事件，覆盖完整生命周期：

| event | data | 时机 |
|---|---|---|
| `meta` | `{ messageId, conversationId }` | 助手消息已落库（占位，status=streaming） |
| `citations` | `{ citations }` | RAG 命中时（在 delta 之前） |
| `delta` | `{ content }` | 每个增量文本块 |
| `done` | `{ content, usage }` | 正常结束，含完整内容和 token 用量 |
| `error` | `{ code, message }` | 上游失败 |

事件顺序固定：`meta → citations? → delta* → done | error`

为什么 `citations` 排在 `delta` 之前？因为引用在检索阶段就确定了，那时模型还没开始生成。前端可以先展示「基于以下资料回答」，再逐字显示正文。

## wire 格式

```text
event: delta
data: {"content":"你"}

event: delta
data: {"content":"好"}

```

每个事件两行：`event: 名称` + `data: JSON`，事件之间空行分隔。前端按 `\n\n` 切分，再解析 `event:` 和 `data:` 行。

## 后端：异步生成器 + SSE 桥接

`chatOrchestrator.streamChat()` 返回一个异步生成器，逐 yield 事件：

```ts
async *streamChat(input) {
  // 创建会话 + 助手占位消息
  yield { event: 'meta', data: { messageId, conversationId } };

  // RAG 检索（可选）
  if (assistant.knowledgeBaseId) {
    const retrieved = await retrieve(...);
    if (retrieved?.citations.length) {
      yield { event: 'citations', data: { citations } };
    }
  }

  // 调上游模型，逐 chunk 转发
  for await (const chunk of provider.chatStream({...})) {
    if (chunk.delta) yield { event: 'delta', data: { content: chunk.delta } };
  }

  // 写回完整内容 + usage
  yield { event: 'done', data: { content, usage } };
}
```

Route Handler 把生成器桥接成 SSE Response：

```ts
const stream = new ReadableStream({
  async start(controller) {
    for await (const event of events) {
      controller.enqueue(encoder.encode(formatSse(event.event, event.data)));
    }
    controller.close();
  },
});
return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
```

异步生成器的好处是背压天然：上游来一块、yield 一块、浏览器收一块，不需要在内存里缓冲整段回答。

## 中断：用户点了停止怎么办

用户中途点停止，前端 abort 请求。`request.signal` 一路传到编排器，再透传给上游 fetch，整条链路共用同一个取消信号。

编排器捕获中断后：

1. 把已生成的内容写回数据库（消息置 `stopped`）；
2. yield 一个 `done`（content 是已生成的部分，usage 为 null）；
3. 不再下发 delta。

关键语义是：**已生成的内容不丢**。用户停在一半，刷新页面还能看到那半段回答。中断不是异常分支，而是一种需要正常收尾的状态。

## 上游 SSE 解析的坑

OpenAI 兼容接口返回的 SSE 长这样：

```text
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

解析器必须处理四种真实世界的脏情况：

- **半包**：一个 data JSON 可能被 TCP 拆成两个包，要缓冲拼接；
- **多行 data**：有些实现的 data 跨多行；
- **CRLF**：Windows 风格换行是 `\r\n`；
- **`[DONE]`**：结束标记，它不是 JSON，不能拿去 JSON.parse。

对应解法是写一个逐字符处理的状态机 parser，不依赖「一次读到完整行」这个假设——网络层怎么拆包都不会解析错乱。

## 重试的边界

流式请求**不重试**。原因很硬：重试会导致上游重复计费，而且用户已经看到一部分内容，重发会让界面内容错乱。

具体策略：只有连接错误和 5xx 才重试，SSE 通道一旦建立就独立、不重试；超时也只在「响应头到达前」生效——开始收流之后不设超时，让模型可以慢慢生成长回答。

## 前端：本地 live 列表接管渲染

历史消息平时走 React Query 拉取，流式期间用一个本地 `live` 列表临时接管：

```ts
const baseMessages = live ?? historyQuery.data ?? [];
```

每收到一个 delta，就追加到最后一条 assistant 消息的 content。流结束（done/error）后把 live 置回 null，React Query 自动刷新服务端历史，两段数据无缝衔接。这样流式过程不需要乐观更新整套缓存，也不会和服务端状态打架。

## 小结

流式对话的体验来自每一层的咬合：

1. **事件设计**：meta/citations/delta/done/error 覆盖全生命周期，顺序固定；
2. **异步生成器**：后端逐 yield，内存友好、背压天然、可中断；
3. **SSE 桥接**：ReadableStream 把生成器转成标准 HTTP 流；
4. **中断语义**：abort 后写回已生成内容，消息置 stopped，不丢数据；
5. **前端双列表**：流式期间本地接管，结束后回落服务端历史。

下一篇讲上游适配层：一套代码怎么接入所有兼容 OpenAI 协议的大模型供应商。
