# 一个纯函数处理器，撑起 MCP 的 HTTP 与 stdio 两种承载

v0.6 我们做过 MCP **客户端**（接入外部 stdio/http 服务器的工具）。v0.9 要反过来做 MCP **服务端**：让外部 MCP 客户端发现并调用我们的流程。MCP 的传输有两种主流形态——stdio（子进程行帧）和 streamable HTTP——如果为每种承载各写一套协议处理，行为漂移几乎是必然的。我们的做法是把协议处理收敛成一个纯函数，传输层只做帧编解码。

## 处理器：消息进，响应出

```ts
async function handleMcpMessage(
  message: JsonRpcMessage,
  ctx: McpServerContext,
): Promise<JsonRpcResponse | null>
```

就这一个签名。输入是解析好的 JSON-RPC 消息，输出是响应对象，或者 `null`（通知无响应）。支持的最小方法集：

| 方法 | 行为 |
|---|---|
| `initialize` | 协议版本协商（客户端版本在支持清单内则采用，否则回落服务端版本）+ capabilities.tools + serverInfo |
| `notifications/initialized` | 消费，无响应 |
| `tools/list` | 列出本密钥可见流程工具，v1 无分页（省略 nextCursor） |
| `tools/call` | 校验 `{name, arguments?}`，映射到流程入队执行，等待终态 |
| `ping` | `{}` |
| 其他 | `-32601 method not found` |

错误码沿用 JSON-RPC 2.0 标准：`-32700` 解析失败、`-32600` 非法请求、`-32601` 方法不存在、`-32602` 参数错误、`-32603` 内部错误。

纯函数的好处直接体现在测试上：协议正确性不需要任何 socket/HTTP，喂报文、断输出即可，9 个报文级用例覆盖了版本协商、通知无帧、未知工具/坏参数、-32601、业务失败 isError 等全部路径。

## 流程到工具的描述符映射

```ts
function describeFlowAsMcpTool(workflow, graph): McpToolDescriptor {
  return {
    name: `flow_${workflow.id.replace(/-/g,'').slice(0,8)}`,
    description: workflow.description || `工作流：${workflow.name}`,
    inputSchema: buildFlowInputJsonSchema(readFlowStartFields(graph)),
    workflowId: workflow.id,   // 内部字段，出帧前剥离
  };
}
```

- 名称是稳定短码：workflowId 是 UUID，全名太长且对模型不友好；前 8 位 hex 短、好选、同一流程永不变。理论碰撞用「逐位追加」去重（多端点场景预留，v1 一密钥一流程实际碰不到）；
- `inputSchema` 直接复用 start 节点的字段声明——对话工具、HTTP invoke、MCP 三个入口共用同一份入参契约，不会出现「HTTP 能调的参数 MCP 校验不过」；
- tools/list 出帧时剥掉 `workflowId` 等内部字段。

tools/call 的等待上限 90 秒。超时不报错卡死，而是返回一段指引文本（`isError:false`）：流程仍在跑，附 runId，让客户端改用 HTTP 轮询。流程业务失败才回 `isError:true` + 结构化 JSON（runId/status/error），符合 MCP「协议错误走 JSON-RPC error，工具业务失败走 content+isError」的分层。

## HTTP 承载：无状态、单消息

```text
POST /api/public/mcp
Authorization: Bearer <端点密钥>
{ "jsonrpc":"2.0", "id":1, "method":"tools/list" }
```

实现就是 M2 公开路由链 + 处理器：

```ts
export const POST = definePublicRoute('mcp', async ({ request, services, endpoint }) => {
  const message = await readJsonBody(request);
  const ctx = createMcpFlowContext({ endpoint, workflows, flowRunner });
  const response = await handleMcpMessage(message, ctx);
  if (!response) return new Response(null, { status: 204 });  // 通知
  return new Response(JSON.stringify(response), { ... });
});
```

v1 明确不做 SSE 响应流和 JSON-RPC batch：无状态单消息已经覆盖标准 MCP 客户端的 initialize/list/call 三连，鉴权/限流/Host 防护全部复用 HTTP API 那套，不重复实现。

## 自举验证：自己调自己

最有说服力的验证是自举——在应用「设置 → MCP 服务器」里把自己注册成 HTTP MCP 服务器：

```json
{ "url": "http://127.0.0.1:3000/api/public/mcp",
  "headers": { "Authorization": "Bearer <端点密钥>" } }
```

注册后工具目录出现 `mcp:bootstrap:flow_<短码>`，调试台真实 tools/call 返回流程输出。这条链路证明：我们的 MCP server 能被我们 v0.6 写的 MCP client 无修改地消费——协议层没有自说自话。

## stdio：同一颗处理器心脏

stdio 承载在下一篇细讲，核心是另一个 adapter 做 stdin/stdout 行帧，内部同样调用 `handleMcpMessage`。协议代码一行不重复。

```text
stdio:  stdin 行帧 → decode → handleMcpMessage → encode → stdout
HTTP:   HTTP body → JSON.parse → handleMcpMessage → JSON → Response
```

这种「纯处理器 + 薄 adapter」的结构让后续加新承载（比如命名管道）只需要再写一个帧适配器，协议行为天然一致。

## 一个协议细节：通知和响应顺序

- **通知绝不能产生响应帧**。`notifications/initialized` 处理完只回 null，stdio adapter 看到 null 不写 stdout，HTTP adapter 回 204；
- **响应顺序必须等于请求顺序**。stdio 是单通道多路复用（id 区分），如果坏帧的同步错误响应插队到前一个 async 请求结果前面，客户端的 pending 匹配就乱了。stdio adapter 用一条 promise 链把帧处理串行化，保证保序。这个坑下一篇展开。
