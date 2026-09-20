# SSE 流式对话是怎么炼成的：从上游 chunk 到前端渲染

> 打字机效果的背后，是一条精心设计的事件流。

## 为什么要流式

如果等模型把整段回答生成完再返回，用户要盯着空白屏幕等好几秒。流式对话（Server-Sent Events）让模型每生成一个 token 就推一个增量，前端边收边渲染——体验从「等半天」变成「看它打字」。

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

我定义了 5 种事件，覆盖完整生命周期：

| event | data | 时机 |
|---|---|---|
| `meta` | `{ messageId, conversationId }` | 助手消息已落库（占位，status=streaming） |
| `citations` | `{ citations }` | RAG 命中时（在 delta 之前） |
| `delta` | `{ content }` | 每个增量文本块 |
| `done` | `{ content, usage }` | 正常结束，含完整内容和 token 用量 |
| `error` | `{ code, message }` | 上游失败 |

顺序：`meta → citations? → delta* → done | error`

为什么 `citations` 在 `delta` 之前？因为引用是检索阶段就确定的，模型还没开始生成。前端可以先展示「基于以下资料回答」，再逐字显示内容。

## wire 格式

```
event: delta
data: {"content":"你"}

event: delta
data: {"content":"好"}

```

每个事件两行：`event: 名称` + `data: JSON`，空行分隔。前端按 `\n\n` 切分，再解析 `event:` 和 `data:` 行。

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

Route Handler 里把生成器桥接成 SSE Response：

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

## 中断：用户点了停止怎么办

用户中途点停止，前端 abort 请求。`request.signal` 传到编排器，再透传给上游 fetch。

编排器捕获中断后：
1. 把已生成的内容写回数据库（消息置 `stopped`）
2. yield 一个 `done`（content 是已生成的部分，usage 为 null）
3. 不再下发 delta

关键点：**已生成的内容不丢**。用户停在一半，刷新页面还能看到那半段回答。

## 上游 SSE 解析的坑

OpenAI 兼容接口返回的 SSE 是这样的：

```
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

解析器要处理：
- **半包**：一个 data JSON 可能被 TCP 拆成两个包，要缓冲拼接
- **多行 data**：有些实现 data 跨多行
- **CRLF**：Windows 换行是 `\r\n`
- **`[DONE]`**：结束标记，不是 JSON

我写了个状态机 parser，逐字符处理，不依赖完整行——网络怎么拆包都不怕。

## 重试的边界

流式请求**不重试**。原因很简单：重试会导致重复计费，而且用户已经看到一部分内容了，重发会乱。

只有连接错误和 5xx 才重试，但 SSE 通道独立、不重试。超时也只在「响应头到达前」生效——一旦开始收流，就不设超时，让模型慢慢生成。

## 前端：本地 live 列表接管

流式期间，历史消息来自 React Query，流式期间用本地 `live` 列表接管：

```ts
const baseMessages = live ?? historyQuery.data ?? [];
```

每收到一个 delta，就追加到最后一条 assistant 消息的 content。流结束（done/error）后，把 live 置回 null，React Query 自动刷新历史，无缝衔接。

## 小结

流式对话的体验来自每一层的协作：

1. **事件设计**：meta/citations/delta/done/error 覆盖全生命周期
2. **异步生成器**：后端逐 yield，内存友好、可中断
3. **SSE 桥接**：ReadableStream 把生成器转成 HTTP 流
4. **中断语义**：abort 后写回已生成内容，不丢数据
5. **前端双列表**：流式期间本地接管，结束后回落服务端历史

下一篇聊聊「一套代码接入所有大模型：OpenAI 兼容适配器设计」。
