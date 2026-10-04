# Electron 桌面应用的进程模型：为什么 fork Next.js standalone

> 一套代码，Web 和桌面共用，怎么做到的？

## 目标

我要一个 AI 助手，既能在浏览器里用（Web 模式），也能打包成桌面应用（Electron 模式）。两套代码维护不起，必须**一套代码双端跑**。

## 方案：Electron 主进程 fork Next.js standalone

核心思路：桌面端不重写 UI，而是把 Next.js 的生产构建（standalone server）作为子进程跑起来，Electron 主进程只负责「开窗口 + 托管服务 + 管密钥」。

```text
electron.exe
├─ 主进程（Electron）
│   ├─ 生成随机端口 + 随机令牌
│   ├─ fork server.js（Next standalone）
│   ├─ 轮询 /api/health 直至就绪
│   └─ BrowserWindow 加载 http://127.0.0.1:{port}
└─ 子进程（Node）
    └─ Next.js server → core → SQLite / AI
```

## 为什么用 standalone 而不是 next dev

- **standalone 是生产构建**：经过 tree-shaking 和优化，体积小、启动快
- **next dev 带热更新**：桌面交付不需要，反而拖慢启动
- **standalone 自包含**：只有运行时必需的文件，打包干净

Next.js 的 `output: 'standalone'` 会产出一个 `server.js`，跑起来就是个完整的 HTTP 服务。

## 主进程的职责

主进程很薄，只做四件事：

### 1. 托管服务生命周期

```ts
const child = fork(serverPath, [], {
  env: { PORT, HOSTNAME: '127.0.0.1', WBFM_TOKEN, WBFM_DATA_ROOT },
});
await waitForServer(`http://127.0.0.1:${port}`, token); // 轮询 health
```

服务就绪后才开窗，避免白屏。

### 2. 安全配置

```ts
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // 隔离渲染进程和主进程
    nodeIntegration: false,   // 渲染层不能用 Node API
    sandbox: true,            // 沙箱
  },
});
```

### 3. 密钥桥接

主进程用 safeStorage 加解密，通过本地一次性 HTTP 桥供子进程调用（详见密钥篇）。

### 4. 窗口管理

单实例锁、窗口状态持久化、菜单、退出时回收子进程。

## 安全：本地服务也要鉴权

子进程跑在 127.0.0.1，但本机其他进程也能访问。所以：

- 端口随机（避免固定端口被扫）
- 启动令牌（`WBFM_TOKEN`），所有 API 校验 `x-wbfm-token` 头
- 令牌通过 preload 暴露给前端，不放在 URL 里（防止被历史记录/日志收集）

## 打包的资源归集

standalone 产物 + 静态资源 + 原生模块，要一起打进 Electron 包。打包脚本做这件事：

```text
resources/server/
├── apps/web/server.js      # standalone 入口
├── node_modules/           # 运行时依赖（含 better-sqlite3）
├── node/node.exe           # 内置真实 Node（详见 ABI 篇）
├── apps/web/.next/static/  # 静态资源
└── apps/web/public/        # public 资源
```

electron-builder 用 `extraResources` 把整个 `server/` 目录打进去。

## 退出回收

```ts
app.on('will-quit', async (event) => {
  event.preventDefault();
  await managedServer.stop();  // SIGTERM → 等 5s → SIGKILL
  app.exit(0);
});
```

先优雅停止子进程（给它时间关数据库、释放端口），超时再强杀。确保下次启动端口不被占。

## Web 模式 vs 桌面模式

同一套代码，通过环境变量区分：

| | Web 模式 | 桌面模式 |
|---|---|---|
| 启动方式 | `next dev` / `next start` | Electron fork standalone |
| 令牌守卫 | 关闭（`WBFM_SERVER_MANAGED` 未设） | 开启 |
| 密钥加密 | AES-256-GCM | safeStorage 桥 |
| 数据根 | `~/.workbuddy-for-me` | userData/data |

业务代码完全一样，只是基础设施层根据环境切换实现。

## 好处

1. **代码复用 100%**：Web 和桌面用同一套 Next.js 代码
2. **桌面壳很薄**：Electron 只做托管，业务全在 Next 里
3. **原生模块不头疼**：跑在真实 Node 子进程，不用 electron-rebuild
4. **安全边界清晰**：主进程管系统能力，子进程管业务，互不污染

## 小结

Electron + Next.js standalone 的架构：

1. **主进程 fork standalone server**，Electron 只做壳
2. **随机端口 + 令牌守卫**，防本机其他进程调用
3. **safeStorage 桥接**，子进程不碰系统密钥链
4. **打包归集资源**，standalone + 静态 + 内置 Node 一起打

一套代码，两种交付，这就是全栈框架 + Electron 的正确打开方式。

下一篇聊聊「统一响应包络 + 领域错误码：让前后端吵架变少」。
