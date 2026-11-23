# stdio 子进程的生死：退出清理、Windows 树杀与监听器防重

这个本地 AI 应用通过 stdio MCP 接入外部工具。stdio MCP server 的形态是本地子进程：`npx -y @modelcontextprotocol/server-filesystem /path` 这样一条命令拉起。接入生态的代价从此具体化——**每个启用的 MCP server 都是一个我们拉起的进程，它的生死由我们负责**。

不负责的后果很具体：应用退出后 npx 进程变孤儿留在系统里；server 崩了没人知道，工具调用永远超时；Windows 上杀进程杀不干净，孙进程泄漏。这篇讲生命周期管理的三个面：退出清理、树杀、以及一个踩过的监听器坑。

## 架构分工：桌面主进程托管，web server 经 IPC

先厘清谁拥有子进程。应用的部署形态有两种：纯 web（next server）和桌面端（Electron 主进程 fork web server 子进程）。MCP 子进程应该挂在哪？

答案：**桌面形态下由主进程托管，web 形态下由 web server 自己拉起**。理由：

- 桌面端的主进程是生命周期最长、最可靠的进程（web server 是 fork 的子进程，可能重启）；MCP server 挂主进程，web server 重启不断连。
- Electron 主进程有最完整的退出钩子（`will-quit` / `window-all-closed`），清理时机最可靠。
- 后来的桌面助手能力（屏幕感知、键鼠操作）本来就要主进程做宿主，MCP 托管是同一模式的提前演练。

web server 与主进程之间的工具调用走本地控制通道——这套通道当时承担 MCP 转发，后来扩展为桌面能力的通用控制面。

## 退出清理：SIGTERM/SIGINT/exit 三路钩子

应用退出路径有三条：正常退出（SIGTERM/SIGINT）、窗口关闭、异常退出（`exit` 事件）。清理注册要全覆盖：

```typescript
const cleanup = () => { void registry.disconnectAll(); };
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('exit', cleanup);
```

`disconnectAll` 对每个连接：先尝试优雅关闭（stdin 关闭 → 等短暂窗口期 → SIGTERM），超时强杀。优雅在前是因为 MCP server 可能持有状态（文件句柄、写了一半的缓存），给它一个收尾机会。

**exit 钩子里的限制**：`exit` 事件里只能做同步操作，异步的 disconnectAll 在 exit 里来不及跑完。所以 exit 钩子是兜底中的兜底——真正的清理靠前两个信号钩子完成。三层钩子的语义是「尽力清理，逐级降级」，不是「保证清理」。

## Windows 树杀：为什么 TerminateProcess 不够

实际踩的坑：桌面端停止 MCP server 时，初版用 `child.kill()`（Windows 下映射到 TerminateProcess）。测试发现 **npx 进程死了，它拉起的实际 server 进程还活着**。

原因：Windows 上 `npx -y @some/mcp-server` 是两层进程——npx 自己是 cmd shim 包出来的壳，真正的 server 是它的子进程。TerminateProcess 只杀目标进程本身，**不杀进程树**。壳死了，肉还在。

修复（桌面侧的 stopChild，win32 分支）：

```typescript
// Windows：taskkill /T（树）/F（强制）/PID
spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
```

`/T` 终止整棵进程树，`/F` 强制。类 Unix 平台没这个问题（kill 负 pid 可以杀进程组，或者子进程默认随父退出语义更干净），所以 platform 分支只在 win32 生效。

**可测试性设计**：platform 和 spawnImpl 都是可注入参数——单测注入假 platform='win32' + 记录参数的假 spawn，断言「win32 下确实用 taskkill /T /F」而不需要在 CI 里真起 Windows 进程。系统边界（进程管理）用注入隔离，逻辑（哪个平台走哪个命令）保持纯函数式可测，这是项目里所有 OS 交互的统一模式。

## 监听器坑：MaxListenersExceededWarning

开发中期控制台开始出现：

```text
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 exit listeners added to [process]
```

根因：`getServices` 在 Next dev 的模块热重载下被多次执行，每次执行都给 process 注册一套 SIGTERM/SIGINT/exit 钩子。钩子是模块级副作用，HMR 不卸载旧监听器——dev 下改几次代码，监听器就过 10 个的默认上限。

修复：标志挂 globalThis，防模块重载重复注册：

```typescript
const g = globalThis as { __appExitHooksRegistered?: boolean };
if (!g.__appExitHooksRegistered) {
  g.__appExitHooksRegistered = true;
  process.on('SIGTERM', cleanup);
  ...
}
```

这个模式有个更值得说的推论：**dev 环境的 HMR 语义和生产环境的模块语义是两回事**。生产环境模块加载一次，进程级钩子注册一次；dev 环境模块加载 N 次。所有进程级副作用（信号钩子、定时器、单例连接）在 Next dev 下都必须考虑重载。globalThis 标志是 Next 官方文档认可的 dev 单例模式（prisma 客户端的官方示例就是同款）。

## 状态可视：连接状态与失败原因

服务器管理面板 `mcp-panel.tsx` 显示每个 server 的状态：已连接（含工具数）/ 连接中 / 失败（含原因）。

「失败原因可见」是可运维性的底线。MCP server 起不来的原因五花八门：npx 包名错了、路径权限不够、Node 版本太旧、server 自己初始化报错。把这些 stderr 摘要透传到 UI，用户才能自助排障——「连接失败」四个字是把用户推向放弃。

## 集成测试的纪律

MCP 路由的集成测试有一条纪律：**POST 一律 enabled:false**。原因是 reconcile 会按 enabled 配置真拉 npx 子进程——测试环境没有也不该有真实 MCP server，拉起就是超时 + 失败。集成测试测的是「配置 CRUD + 状态机转换」，不是「真实连接」（那是 core 层集成测试的职责，见上一篇）。层与层的测试边界要清晰：路由层 mock 连接，core 层真起进程。

## 小结

子进程生命周期的设计可以浓缩为：**拉起要谨慎（配置是真相源），活着要可视（状态 + 原因上 UI），死掉要干净（树杀 + 三路钩子兜底），副作用要防重（globalThis 单例）**。

进程管好了，工具能调了——接下来是安全主线：这些工具里，哪些能随便调，哪些必须先问人？下一篇讲三级权限模型。
