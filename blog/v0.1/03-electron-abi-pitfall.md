# Electron 打包后窗口 30 秒不出现：一次 ABI 不匹配排查实录

Electron 应用里加载原生 Node 模块，九成的诡异启动问题都出在 ABI 上。这篇复盘一个典型案例：Web 模式一切正常，打包成桌面应用后窗口死活不出来，健康检查轮询 30 秒超时退出，而控制台只有一句干巴巴的「启动失败」。

整个排查调了两天，最后的修复只有一行：fork 子进程时显式传入 `execPath`。比修复更值钱的是定位过程——先讲怎么让被吞掉的错误开口说话。

## 第一步：让错误说话

子进程毫无输出，是因为 `child_process.fork` 的错误监听根本没加，所有错误都被静默吞掉。先补上 `error` 和 `exit` 监听，并把子进程的 stdout/stderr 全部转发到主进程控制台：

```ts
child.stdout?.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
child.stderr?.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
child.on('error', (error) => console.error('[server] fork error:', error));
child.once('exit', (code, signal) => {
  console.error(`[server] 子进程退出 code=${code} signal=${signal}`);
});
```

重新打包，真正的错误终于冒出来：

```text
[server] Error: The module 'better-sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 137. This version of Node.js requires
NODE_MODULE_VERSION 125.
```

## 根因：两个 Node，两套 ABI

这个本地 AI 应用的桌面架构是：Electron 主进程 fork 一个子进程跑 Next.js standalone server，`better-sqlite3` 在子进程里加载。打包后，主进程跑在 **Electron 内置的 Node** 上（ABI 125）。

问题出在 fork 的默认行为上：**`fork` 默认沿用父进程的 Node 运行时**，也就是 Electron 内置 Node（ABI 125）。但打包进去的 `better-sqlite3.node`，是构建阶段用 **Node 24（ABI 137）** 编译的。

两个 ABI 对不上，原生模块 dlopen 直接失败，server 永远起不来，健康检查轮询 30 秒后超时，窗口自然不出现。

> **ABI（Application Binary Interface）** 可以理解为原生模块和 Node 引擎之间的「接口版本号」。编译时的 Node 与运行时的 Node ABI 不一致，就像 USB-C 插头插进 USB-A 口——物理上就对不上。

## 修复：让子进程用「对的」Node

最稳的办法：**打包时把构建用的真实 Node 一起打进去，fork 时显式指定 `execPath`**。

在打包脚本里复制 Node：

```js
// prepare-server.mjs
const nodeTarget = path.join(target, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
fs.copyFileSync(process.execPath, nodeTarget);
```

fork 时显式指定：

```ts
const child = fork(serverPath, [], {
  execPath: resolveNodeRuntimePath(serverPath), // 指向打包内置的 node.exe
  execArgv: ['--require', bootstrapPath],
  // ...
});
```

`resolveNodeRuntimePath` 在开发态（未打包）返回 `null`，回落 Electron 默认行为；打包后指向内置 Node。这样：

- 子进程运行的 Node ABI = 编译原生模块时的 Node ABI；
- better-sqlite3 正常加载；
- 不需要 electron-rebuild。

## 为什么选这个方案

1. **零网络依赖**：不依赖预编译的 electron 版原生模块，打包机断网也能出产物；
2. **ABI 天然一致**：构建机用什么 Node，打包进去就是什么 Node，不存在版本漂移；
3. **开发态无感**：未打包时回落默认行为，日常开发零额外步骤。

顺带一提，这套「业务跑在真实 Node 子进程」的架构还有个红利：后续语音能力引入更重的原生绑定（`.node`/DLL）时，同样不用碰 electron-rebuild，从根上绕开了 Electron ABI 这一类老坑。

## 经验教训

1. **fork 子进程一定要加 error/exit 监听**——否则出问题连日志都看不到，排查纯靠猜；
2. **Electron 里跑原生模块，先想清楚 ABI**——主进程和子进程可能根本是两套 Node；
3. **Windows 上还有 Smart App Control 的坑**——未签名 exe 会被系统拦截，那是分发层面的另一个问题。

## 小结

记住三条：

- 打包后的运行时 Node 版本，可能和构建时的不一样，别假设一致；
- 让子进程用与原生模块编译时一致的 Node（内置 Node + `execPath`），是最稳的解法；
- 没有日志的 bug 不是 bug，是玄学——排查的第一步永远是先让错误可见。

下一篇聊「本地 AI 应用的密钥怎么存才安全」：Electron safeStorage 与一次性加解密桥的设计。
