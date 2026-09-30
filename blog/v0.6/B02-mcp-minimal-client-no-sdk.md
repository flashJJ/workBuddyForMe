---
title: "MCP 客户端最小自实现：为什么弃官方 SDK，五个文件撑起完整协议"
series: "WorkBuddy For Me v0.6 技术拆解"
number: "B02"
tags: ["workbuddy", "mcp", "jsonrpc", "protocol", "dependencies"]
date: "2025-Q4"
---

## 决策：官方 SDK 被弃用

v0.6 M1 评审时的第一题：MCP 客户端用官方 `@modelcontextprotocol/sdk` 还是自实现？

先看官方 SDK 的代价。装 `@modelcontextprotocol/sdk` 后 lockfile 增长 **513 行**，传递依赖 17 个包——express5、hono、jose、zod-to-json-schema……问题是：**这些全是服务端依赖**。SDK 把 client 和 server 打在一个包里，我们要的纯客户端用途（连别人的 MCP server）被迫拖进一整套 HTTP 服务器框架。

对一个「本地优先、依赖越少越好」的项目，这是不可接受的打包负担——v0.4 已经有 canvas/tesseract 原生依赖的前车之鉴，lockfile 每多一分，Electron 打包炸链的概率就涨一分。

再看自实现的成本。MCP 协议我们实际需要的面非常窄：

```text
initialize            握手（协商 protocolVersion '2025-06-18'）
notifications/initialized  握手完成通知
tools/list            工具发现
tools/call            工具调用
```

没有 resources、没有 prompts、没有 sampling、没有 roots——我们是**工具消费者**，不是全功能客户端。这个面自实现下来是 [packages/core/src/mcp/](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/index.ts) 五个文件：jsonrpc / stdio-transport / http-transport / client / registry。

结论：自实现。这篇讲协议层怎么设计，以及踩过的坑。

---

## 第一层：JSON-RPC 消息框架

MCP 跑在 JSON-RPC 2.0 上。[jsonrpc.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/jsonrpc.ts) 只做三件事：消息编解码、请求-响应配对、通知与请求分流。

JSON-RPC 的消息有三种形态：

```typescript
{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {...} }   // 请求（有 id）
{ jsonrpc: '2.0', id: 1, result: {...} }                          // 响应（id 配对）
{ jsonrpc: '2.0', method: 'notifications/initialized' }           // 通知（无 id，无响应）
```

核心机制是**请求-响应配对的挂起表**：发出请求时把 `id → {resolve, reject, timer}` 挂进 Map，收到响应时按 id 配对 resolve。每个请求带超时定时器，超时 reject 并清理挂起项——MCP server 是外部进程，不响应是常态，挂起表必须有自我清理能力，否则内存随失败请求泄漏。

stdio 传输的特殊性：**消息以换行分隔**（MCP 规定 stdio 用 newline-delimited JSON，不是 Content-Length 头——那是 LSP 的风格）。子进程 stdout 的数据是流式到达的，一条消息可能分几个 chunk 到，多条消息可能粘在一个 chunk 里。transport 层维护一个行缓冲：数据到达 → append → 按 `\n` 切 → 完整行解析 JSON → 不完整行留缓冲等下一块。这个「行缓冲拼接」是 stdio 解析唯一容易写错的地方，[stdio-transport.test.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/stdio-transport.test.ts) 里用分片投递的用例钉死了它。

---

## 第二层：client 的状态机

[client.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/client.ts) 在 JSON-RPC 之上维护 MCP 会话状态：

```text
disconnected → connecting → initializing → ready → (error | disconnected)
                ↑ transport 连接      ↑ initialize 握手完成
                                      ↑ 并发出 notifications/initialized
```

握手时序是 MCP 协议的硬性要求：

```text
client → initialize（带 protocolVersion + capabilities + clientInfo）
server → initialize result（server 的 protocolVersion + capabilities）
client → notifications/initialized   ← 不发这个，server 有权拒绝后续请求
client → tools/list / tools/call ...
```

`protocolVersion` 我们固定声明 `'2025-06-18'`。版本协商的语义是「客户端声明自己支持的版本，服务端回它能用的版本」——不一致时客户端要决定降版本还是断开。当前实现选择简单策略：服务端回的版本不认识就报错（错误信息带双方版本号），不自动降版本——自动降版本意味着要同时维护多版本协议分支，复杂度不值。

**tools/list 的结果缓存**：工具发现在握手后做一次，缓存到断开。MCP server 的工具集在会话内通常不变（协议有 tools/list_changed 通知，但几乎没有 server 实现），每轮对话都重新 list 是浪费。重连后重新发现。

---

## 第三层：registry 的聚合门面

多个 MCP server 的管理收敛在 [registry.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/registry.ts)：

```text
registry
  ├─ createServer / updateServer / removeServer   配置 CRUD（落库 mcp_servers 表）
  ├─ reconcileAll                                  启动时按 DB 配置对齐连接状态
  ├─ resolveTool('mcp:filesystem:read_file')        限定名 → 连接 + 工具
  └─ disconnectAll                                 退出清理
```

**reconcile 的语义是「对齐」不是「拉起」**：应用启动时读 mcp_servers 表，enabled=true 的连接、enabled=false 的断开、DB 里不存在的连接清掉。配置是真相源，连接状态是配置的影子——这个单向数据流让「启停即时生效」自然成立：UI 改配置 → 触发 reconcile → 连接状态跟上。

**意外退出标 error 不自动重启**。子进程 crash 后 server 状态标 error 并记录原因，不自动拉起——崩溃循环（拉起即崩、崩了又拉）比不可用更糟糕，而且自动重启会掩盖配置错误。熔断归 P1 的工具级熔断器（B07），server 级靠用户看到 error 状态后人工处理。这是刻意的保守：**自动恢复策略要先证明「恢复有用」，而 MCP server 崩溃的绝大多数原因是配置错误，重拉一百次也是崩**。

---

## 命名空间：`mcp:<server>:<tool>`

MCP 工具进统一注册表时冠以限定名：`mcp:filesystem:read_file`（server 名 + 工具名）。shared 里的 `QUALIFIED_TOOL_NAME_PATTERN` 接受整名或两段全名。

为什么必须限定：**工具名冲突是接入生态的必然**。两个 MCP server 都可以有叫 `read` 的工具，内置工具也可能与 MCP 工具同名。限定名让冲突在命名层面消失，也让 UI 徽章（「来源：filesystem MCP」）有现成的解析依据——从限定名拆 server 段即可，不用查表。

模型的视角里限定名就是普通工具名，tool_calls 链路无任何分叉——「接入生态」对模型完全透明，这是 M1 最重要的架构正确性。

---

## 集成测试：真的 spawn 一个 echo server

[mcp-client.integration.test.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/mcp/mcp-client.integration.test.ts) 的价值在于不 mock 子进程：测试里真的 spawn 一个 Node 写的 echo MCP server（几十行，实现 initialize/tools/list/tools/call），跑完整握手 + 工具发现 + 调用 + 断开。

协议实现的 mock 测试有个根本弱点：**mock 的是你对协议的想象，不是协议本身**。行缓冲分片、通知无响应、握手时序——这些都只有真实子进程能验证。17 个测试里集成用例占了一半，这是协议层该有的测试配比。

---

## 小结

自实现的账：**五个文件 + 17 个测试** 对 **17 个服务端依赖 + 513 行 lockfile**。协议面窄（四个方法）是这笔账成立的前提——如果未来需要 resources/prompts，账要重算。但 YAGNI：今天的需求今天的解，协议版本协商留了演进空间。

客户端能连了，下一个问题是子进程的生死——stdio server 是本地子进程，应用退出时它们怎么办？崩了怎么办？Windows 上杀进程为什么 TerminateProcess 不够？下一篇 B03 讲子进程生命周期管理。
