# Electron 打包后窗口 30 秒不出现：一个 ABI 不匹配的血案

> 调了两天，根因是一行 `execPath` 没传。

## 现象

Web 模式跑得好好的，一打包成桌面应用，窗口就是不出来。等了 30 秒，超时，退出。

控制台只有一句「启动失败」，子进程毫无输出——因为 fork 的错误监听根本没加，所有错误都被静默吞掉了。

## 第一步：让错误说话

先给 `child_process.fork` 加上 `error` 和 `exit` 监听，把子进程的 stdout/stderr 全部转发到主进程控制台：

```ts
child.stdout?.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
child.stderr?.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
child.on('error', (error) => console.error('[server] fork error:', error));
child.once('exit', (code, signal) => {
  console.error(`[server] 子进程退出 code=${code} signal=${signal}`);
});
```

重新打包，错误终于冒出来了：

```
[server] Error: The module 'better-sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 137. This version of Node.js requires
NODE_MODULE_VERSION 125.
```

## 根因：两个 Node，两套 ABI

Electron 打包后，主进程跑在 **Electron 内置的 Node** 上（ABI 125）。而我的桌面架构是：主进程 fork 一个子进程跑 Next.js standalone server，`better-sqlite3` 在子进程里加载。

问题来了：**`fork` 默认用主进程的 Node 运行时**，也就是 Electron 内置 Node（ABI 125）。但打包进去的 `better-sqlite3.node` 是构建时用 **Node 24（ABI 137）** 编译的。

两个 ABI 对不上，原生模块 dlopen 直接失败，server 永远起不来，健康检查轮询 30 秒后超时，窗口自然不出现。

> **ABI（Application Binary Interface）** 可以理解为原生模块和 Node 引擎之间的「接口版本号」。编译时用的 Node 版本和运行时的 Node 版本 ABI 不一致，就像 USB-C 插头插不进 USB-A 接口——物理上就对不上。

## 修复：让子进程用「对的」Node

最稳的办法：**打包时把构建用的真实 Node 一起打进去，fork 时显式指定 `execPath`**。

在打包脚本里复制 Node：

```js
// prepare-server.mjs
const nodeTarget = path.join(target, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
fs.copyFileSync(process.execPath, nodeTarget);
```

fork 时指定：

```ts
const child = fork(serverPath, [], {
  execPath: resolveNodeRuntimePath(serverPath), // 指向打包内置的 node.exe
  execArgv: ['--require', bootstrapPath],
  // ...
});
```

`resolveNodeRuntimePath` 在没打包（开发态）时返回 `null`，回落 Electron 默认；打包后指向内置 Node。这样：

- 子进程运行的 Node ABI = 编译原生模块时的 Node ABI
- better-sqlite3 正常加载
- 不需要 electron-rebuild

## 这个方案的好处

1. **零网络依赖**：不依赖预编译的 electron 版原生模块
2. **ABI 天然一致**：构建机什么 Node，打包进去就什么 Node
3. **开发态无感**：未打包时回落默认行为

## 经验教训

1. **fork 子进程一定要加 error/exit 监听**——否则出问题你连日志都看不到
2. **Electron 里跑原生模块，先想清楚 ABI**——主进程和子进程可能是两套 Node
3. **Windows 上还有 Smart App Control 的坑**——未签名 exe 会被系统拦截，那是另一个故事（下篇聊）

## 小结

Electron + 原生模块的组合，90% 的坑都出在 ABI 上。记住：

- 打包后的运行时 Node 版本，可能和你构建时的不一样
- 让子进程用和原生模块编译时一致的 Node，是最稳的解法
- 没有日志的 bug 不是 bug，是玄学

下一篇聊聊「本地 AI 应用的密钥怎么存才安全」——safeStorage 桥接的设计。
