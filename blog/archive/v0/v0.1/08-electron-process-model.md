# Electron 为什么 fork Next.js standalone：一套代码双端跑的进程模型

这个本地 AI 应用要同时支持两种交付：浏览器里用的 Web 模式，和打包后离线可用的桌面模式。单人维护两套 UI 和两套业务逻辑是不可接受的，所以核心约束只有一条：**一套代码双端跑**。

这篇讲落地架构：Electron 主进程不重写任何界面，而是把 Next.js 的生产构建（standalone server）当子进程托管起来，自己只当一个很薄的壳。理解了进程边界，前面几篇的 ABI、密钥桥、令牌守卫才能串成一个整体。

## 总体方案

```text
electron.exe
├─ 主进程（Electron）
│   ├─ 生成随机端口 + 随机令牌
│   ├─ fork server.js（Next standalone）
│   ├─ 轮询 /api/health 直至就绪
│   └─ BrowserWindow 加载 http://127.0.0.1:{port}
└─ 子进程（真实 Node）
    └─ Next.js server → core → SQLite / AI
```

桌面端不内嵌 UI 代码，而是起一个本地 HTTP 服务，BrowserWindow 加载回环地址上的页面。对 Next.js 这层来说，它感知不到自己跑在 Electron 里。

## 为什么是 standalone 而不是 next dev

- **standalone 是生产构建**：经过 tree-shaking 和优化，体积小、启动快；
- **next dev 带热更新和开发期编译**：桌面交付完全不需要，反而拖慢启动、放大故障面；
- **standalone 自包含**：`output: 'standalone'` 只产出运行时必需的文件（一个 `server.js` 就是完整 HTTP 服务），打包干净。

## 主进程的四件事

主进程刻意保持很薄，只做四件业务之外的事。

### 1. 托管服务生命周期

```ts
const child = fork(serverPath, [], {
  env: { PORT, HOSTNAME: '127.0.0.1', APP_TOKEN, APP_DATA_ROOT },
});
await waitForServer(`http://127.0.0.1:${port}`, token); // 轮询 health
```

服务健康检查通过后才创建窗口，避免用户先看到一个白屏。

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

渲染层拿不到任何 Node 能力，需要系统能力时只能走 preload 暴露的白名单通道。

### 3. 密钥桥接

主进程独占 safeStorage 做加解密，通过本地一次性 HTTP 桥供子进程调用（详见密钥篇）。系统密钥链的能力始终不离开主进程。

### 4. 窗口与进程管理

单实例锁、窗口状态持久化、菜单、退出时回收子进程。

## 安全：回环地址不等于可信边界

子进程服务只绑 127.0.0.1，但**本机其他进程乃至浏览器网页都能访问这个端口**，所以三道措施缺一不可：

- **端口随机**：不用固定端口，避免被扫描和本地冲突；
- **启动令牌**（`APP_TOKEN`）：所有 API 校验 `x-app-token` 头，不对就 401；
- **令牌走 preload 不走 URL**：通过 preload 注入前端环境，避免令牌落进历史记录和访问日志。

## 打包的资源归集

standalone 产物、静态资源、原生模块、内置 Node 要一起打进 Electron 包，打包脚本负责归集：

```text
resources/server/
├── apps/web/server.js      # standalone 入口
├── node_modules/           # 运行时依赖（含 better-sqlite3）
├── node/node.exe           # 内置真实 Node（详见 ABI 篇）
├── apps/web/.next/static/  # 静态资源
└── apps/web/public/        # public 资源
```

electron-builder 用 `extraResources` 把整个 `server/` 目录原样打进去。内置那份真实 Node 是 ABI 方案的关键——子进程用它运行，原生模块就始终跑在与编译时一致的运行时上，不需要 electron-rebuild。

## 退出回收

```ts
app.on('will-quit', async (event) => {
  event.preventDefault();
  await managedServer.stop();  // SIGTERM → 等 5s → SIGKILL
  app.exit(0);
});
```

退出时先发 SIGTERM 给子进程时间关数据库、释放端口，超时再 SIGKILL 强杀。不做这一步，Windows 上很容易出现端口残留，导致下次启动失败。

## Web 模式 vs 桌面模式

同一套代码，只靠环境变量在基础设施层切换实现：

| | Web 模式 | 桌面模式 |
|---|---|---|
| 启动方式 | `next dev` / `next start` | Electron fork standalone |
| 令牌守卫 | 关闭（`APP_SERVER_MANAGED` 未设） | 开启 |
| 密钥加密 | AES-256-GCM | safeStorage 桥 |
| 数据根 | `~/.my-ai-app` | userData/data |

业务代码完全一样，切换只发生在基础设施层：密钥 cipher 有两套实现，进程托管与否由环境变量决定。

## 这个架构的收益

1. **代码复用 100%**：Web 和桌面用同一套 Next.js 代码，连 API 层都不分支；
2. **桌面壳极薄**：Electron 只负责托管和系统能力，业务全在 Next 子进程；
3. **原生模块不头疼**：跑在真实 Node 子进程，ABI 天然一致，不用 electron-rebuild；
4. **安全边界清晰**：主进程管系统能力，子进程管业务，令牌和密钥桥把两者的接触面收到最小。

## 小结

1. **主进程 fork standalone server**，Electron 只做壳，业务零重写；
2. **随机端口 + 令牌守卫**，回环服务也要防本机其他进程调用；
3. **safeStorage 桥接**，子进程永远不直接碰系统密钥链；
4. **打包统一归集**：standalone 产物 + 静态资源 + 内置 Node 一起进包，退出时先礼后兵回收进程。

下一篇讲 API 契约：统一响应包络加领域错误码，怎么让前后端不再为返回格式扯皮。
