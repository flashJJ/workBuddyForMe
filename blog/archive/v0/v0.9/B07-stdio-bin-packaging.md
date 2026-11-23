# stdio MCP bin 打包记：行帧、保序与原生 ABI 的四场小仗

把可视化流程暴露为 MCP 工具，HTTP 承载之外，stdio 是 MCP 生态里最「古典」也最容易翻车的接入方式：Claude Desktop 这类客户端 spawn 一个子进程，stdin 写请求、stdout 读响应，一行一个 JSON。这篇记录四个真实问题：半包粘包与响应保序、启动期鉴权、shebang 位置、原生模块 ABI。

## 第一仗：半包粘包与响应保序

MCP stdio 的分帧规则简单：**一条消息一行 JSON，以 `\n` 分隔**。但简单协议的坑在边角：

1. **半包**：一次 `data` 事件可能只来半行，必须在内部留缓冲区，遇到 `\n` 才切帧，半行等下次数据拼上；
2. **粘包**：一次 `data` 也可能带多行，要循环切完；
3. **保序**：请求是异步处理的，但响应必须按请求帧的顺序写出。

第三个最隐蔽。初版对每行直接 `void onLine(line)`，结果一个坏帧（同步产生 `-32700` 错误响应）的输出插到了前一个正常 tools/list（异步处理）的响应之前。客户端按 id 在 pending map 里匹配，顺序虽然能用 id 找回来，但协议实现理应保证通道秩序，而且不是所有客户端都那么宽容。

修法是一条串行处理链：

```ts
let chain: Promise<void> = Promise.resolve();
while ((index = buffer.indexOf('\n')) >= 0) {
  const line = buffer.slice(0, index);
  buffer = buffer.slice(index + 1);
  if (line.trim()) {
    chain = chain.then(() => onLine(line));   // 一帧处理完才排下一帧
  }
}
```

这样即使错误帧同步出响应、正常帧异步出响应，写 stdout 的顺序也严格等于入站顺序。坏帧测试（`not-json\n`）断言响应 id 为 null 且错误码 -32700。

另一条铁律：**stdout 是协议通道，任何日志只能走 stderr**。启动信息、错误堆栈全部 stderr，调试时一条意外的 console.log 就能让客户端 JSON.parse 整个崩掉。

## 第二仗：鉴权在启动时，不引入每进程 token 握手

stdio 进程是外部客户端拉起的，没有 HTTP 层可以放 Authorization 头。方案选了最简单安全的做法：**spawn 命令行/env 携带端点密钥，进程启动即鉴权**。

```text
LOCAL_MCP_TOKEN=sk_local_xxx node mcp-server.cjs
```

- 进程启动第一件事：解析密钥（env 优先，也接受 `--token=`）→ 打开库 → `authenticate(bearer, 'mcp')`；
- 密钥无效/端点停用：stderr 打明确原因后 `exit(1)`，绝不进入协议循环；
- 推荐 env 而非命令行参数（`/proc`、进程列表、wmic 都可能看到命令行），UI 生成的 spawn JSON 默认把 token 放 env。

stdin 结束（客户端退出）→ 关闭外部 MCP 连接 → exit 0，不留孤儿进程。

## 第三仗：esbuild banner 和 CJS 语法错误

bin 需要打包成单文件（不能让外部客户端带着我们的 monorepo 路径跑）。用 esbuild：`bundle + platform=node + packages:'external' + format=cjs`。第一版加了 shebang banner：

```js
banner: { js: '#!/usr/bin/env node' }
```

结果 node 启动报：

```text
#!/usr/bin/env node
^
SyntaxError: Invalid or unexpected token
```

esbuild 在 banner 前还插了别的内容（use strict 之类），shebang 落到了第 2 行，而 shebang 只在文件**第一行前两个字节**有效。

解决思路不是和 bundler 较劲，而是退一步问：这个文件真的需要可执行位吗？打包形态里它**永远由归集的内置 node 显式启动**（`node mcp-server.cjs`），跨平台 spawn 命令行也是 node + 脚本路径，不依赖 shebang，也不需要 +x。于是直接去掉 banner，问题消失，Windows 上也不用再操心 chmod。

## 第四仗：better-sqlite3 的 ABI（复用归集运行时的答案）

bin 进程要直接打开 SQLite（走 core 的 serving stack 轻量装配：db/cipher/端点仓储/flowRunner，不带对话/摄入等重服务）。better-sqlite3 是原生模块，编译时绑定特定 Node ABI。此前打包托管服务时已经踩过并解决了这个问题：

- Electron 内置 Node 的 ABI 与构建机 Node 不一致，fork 出去 dlopen 直接失败；
- 方案是归集一个与构建同版本的真实 Node 运行时到 `resources/server/node/node.exe`，所有外部 spawn 的服务进程都用它。

MCP bin 搭同一趟便车：

1. esbuild 产物 `apps/web/.next/mcp-server/mcp-server.cjs`（依赖全部 external）；
2. `prepare-server.mjs` 把它复制到 `resources/server/mcp-server/`；
3. 运行时它和 standalone server 共用同一份归集的 `node_modules`，原生模块 ABI 天然一致；
4. 主进程把内置 node 路径与 bin 路径通过环境变量注入 web 服务（`LOCAL_MCP_NODE`/`LOCAL_MCP_BIN`），`/api/system/info` 暴露给前端，端点对话框据此生成可直接粘贴的 spawn JSON（command/args/env）。

在开发态用真实 node 子进程验证：initialize/tools/list/tools/call 全部正常，坏密钥与无密钥均 exit 1，stderr 干净；stdout 只有协议帧。安装包形态的手测（`dist:win` 后外部客户端实际 spawn）列入发布清单，路径与复用链路和已验证的托管服务完全相同。

## 小结

stdio 承载的代码量很小（adapter 一百多行、bin 入口一百行内），但「能用」和「稳定可用」之间全是这种边角：保序、shebang、ABI、stdout 纯净度。把协议逻辑留在纯函数里、把传输细节锁在薄 adapter 里，这些边角就能各自被针对性测试钉住。
