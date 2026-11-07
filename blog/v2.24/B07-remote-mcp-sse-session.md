# 远程 MCP 为什么连不上：SSE、会话头与一次 401 重试

同一个远程 MCP 服务，浏览器里能打开，官方客户端能列工具，应用里却只得到一句「返回了非 JSON 内容」。

这不是服务坏了，而是传输层假设错了：我们默认所有服务器都返回 JSON，而它返回的是 `text/event-stream`。

我们的桌面 AI 应用是一个本地优先、单人开发的私人助手，MCP 支持 stdio 与 HTTP 两种传输。这一篇讲远程 HTTP 传输补齐的三层：SSE 回包、会话头、鉴权重试。

## 第一层：回包不一定是一段 JSON

MCP 的 Streamable HTTP 允许服务器用两种方式回包：

- `application/json`：一个完整的 JSON-RPC 响应；
- `text/event-stream`：一段 SSE 流，里面可能包含多条消息。

旧实现只处理第一种。遇到第二种时，它把整段 SSE 文本丢给 `JSON.parse`，得到「返回了非 JSON 内容」。

修复的第一步是解析 SSE 帧，而不是假设只有一个 payload：

```ts
function parseSseDataFrames(text: string): string[] {
  const frames: string[] = [];
  for (const block of text.replace(/\r\n/g, '\n').split('\n\n')) {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length > 0) frames.push(dataLines.join('\n'));
  }
  return frames;
}
```

解析之后还要按 JSON-RPC id 取自己那条。一个 POST 可能返回多条消息，其中既有响应，也可能有通知；直接取第一条会把别人的消息当成结果。

请求头也要同时声明两种格式：

```text
Accept: application/json, text/event-stream
```

只写 JSON，服务器可能据此协商成 JSON；只写 SSE，又不兼容只返回 JSON 的服务器。两个都写，让服务器选它能给的。

## 第二层：会话不是无状态的

有些服务器在 `initialize` 的响应头里返回 `Mcp-Session-Id`。后续请求必须带上它，否则服务器会当成一次新的会话，工具列表与状态都不连续。

实现上在每次响应后读取这个头：

```ts
const nextSession = response.headers.get('mcp-session-id');
if (nextSession) sessionId = nextSession;
```

之后的每个请求都附带：

```text
Mcp-Session-Id: <session>
MCP-Protocol-Version: <negotiated>
```

协议版本来自 `initialize` 的返回结果，不是客户端单方面声明的版本。服务器可能协商到另一个版本，后续请求必须按协商结果发送。

关闭时也有约定：有会话就发一次 `DELETE`。服务器不支持也无妨，尽力而为，不把关闭失败升级成用户可见错误。

## 第三层：401 不一定是配置错了

远程服务器返回 401 时，旧实现直接报「要求鉴权，请检查 Headers 中的令牌」。

但对 OAuth 服务器来说，401 可能只是访问令牌过期。用户没有配错，令牌也只是需要刷新。

所以请求层加了一次重试：

```ts
for (let attempt = 0; attempt < 2; attempt += 1) {
  const response = await fetch(url, { headers: await requestHeaders(refreshedHeaders) });
  if (response.status === 401 && auth && attempt === 0) {
    const refreshed = await auth.refresh().catch(() => null);
    if (refreshed) {
      refreshedHeaders = refreshed;
      continue;   // 用新令牌重试同一请求
    }
  }
  // ...
}
```

三个约束保证它不会变成死循环：

- 只重试一次，第二次 401 直接失败；
- 刷新失败就退回原错误，不无限重试；
- 重试的是同一个 JSON-RPC 请求，id 不变，不会在服务端产生两条不同语义的调用。

这里还有一个容易忽略的顺序问题：**显式配置的 Headers 要覆盖 OAuth 令牌。** 用户如果自己填了 Personal Access Token，说明他想用这个身份；OAuth 只是补充，不应该反过来覆盖用户配置。

## 为什么不实现服务器主动推送

完整的 Streamable HTTP 还包含服务器主动推送：客户端保持一个长连接，服务器随时发通知。

这一版没有做。原因很实际：当前用到的能力是列工具、调工具、读结果，全部是请求-响应模式；没有主动推送，不影响这些场景。实现一个长连接会带来重连、心跳、消息去重与生命周期管理，成本和收益不成比例。

所以这一版明确是「最小子集」：JSON 或 SSE 回包、会话头、协议版本、关闭请求、401 重试。能力边界写清楚，比假装完整更安全。

## 为什么错误文案也值得改

旧实现的 401 文案是「请检查 Headers 中的令牌」。在 OAuth 场景里，这句话会把用户引向错误的方向：他没有 Headers 可检查，真正要做的是点「授权」。

所以 HTTP 错误做了一层归一：

| 状态 | 文案方向 |
|---|---|
| 401 / 403 | 要求鉴权，检查令牌或完成授权 |
| 404 | 端点不存在，检查 URL |
| 429 | 被限流，稍后重试 |
| 其余 | HTTP 状态 + 截断后的响应体 |

响应体如果是 HTML，不再原样塞进错误里。把一整段反爬页面展示给用户，除了制造噪音没有任何帮助。

## 验证与边界

实机验证连接了一个远程文档检索服务，成功发现 2 个工具，说明 SSE 回包、会话头与协议版本这条链是通的。OAuth 服务器的 401 刷新也在授权流程里做了覆盖。

边界同样明确：没有实现服务器主动推送；SSE 解析按 `data:` 帧处理，不处理注释帧与自定义事件名；`DELETE` 失败被忽略；401 只重试一次，令牌连续失效时需要用户重新授权。

## 一条可复用的判断

**传输兼容不是「支持 HTTP」，而是「接受对方可能给出的每一种合法回包」。** JSON 与 SSE 都是规范内的选择，服务器没有义务按客户端的习惯返回；客户端要做的不是要求对方统一，而是把 `Accept` 写全、把会话头带上、把 401 当成一次可恢复的状态。

下一篇讲远程服务的授权：一条 OAuth 链要经过多少次发现，才能从「401」走到「已连接」。
