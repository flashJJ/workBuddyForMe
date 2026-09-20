# 模块设计：Electron 桌面外壳

> 状态：已实现（Task 29–31/35）

## 职责

- 创建安全 BrowserWindow、单实例锁、窗口状态持久化、基础菜单。
- 生产态托管 Next standalone server 并管理生命周期。
- safeStorage 密钥桥（cipher 桥）；Windows 打包。

## 模块拆分（apps/desktop/src）

| 文件 | 职责 |
|---|---|
| `main/index.ts` | 应用入口：userData 覆盖 → 单实例锁 → whenReady 启动编排 → 退出回收 |
| `main/config.ts` | server.js/内置 Node 运行时/preload 路径解析、数据根、超时常量 |
| `main/cipher-server.ts` | 本地一次性 HTTP 密钥桥：safeStorage 加解密服务（随机 token 鉴权） |
| `main/cipher-bootstrap.ts` | 渲染 cipher 引导脚本（写 userData，`--require` 注入子进程） |
| `main/server-manager.ts` | 随机端口/令牌、fork server.js（execPath=内置 Node）、健康探测、退出回收 |
| `main/wait-for-server.ts` | `/api/health` 轮询（`x-wbfm-token` 头，30s 超时 / 250ms 间隔） |
| `main/window.ts` | 窗口创建与 `webPreferences` 安全配置，boot 参数注入 |
| `main/menu.ts` | 应用菜单（开发态含 DevTools） |
| `main/window-state.ts` | 窗口尺寸/位置持久化（userData 下 JSON） |
| `preload/index.ts` | contextBridge 最小白名单：`window.wbfm = { token, baseUrl, isManaged }` |

## 生产启动时序

```text
app.whenReady → safeStorage.isEncryptionAvailable 检查（不可用即抛错退出）
  → startCipherServer(随机 24B hex token)：本地回环一次性 HTTP 密钥桥
  → startManagedServer：随机端口 + 随机 bearer token
      写 cipher-bootstrap.cjs 到 userData → fork server.js
      （execPath=resources/server/node/node.exe 内置真实 Node，见下；
        env: WBFM_SERVER_MANAGED=1 / WBFM_TOKEN / WBFM_DATA_ROOT；
        --require 注入引导；stdio 含 ipc；error/exit 诊断日志）
  → waitForServer 轮询 /api/health（30s 超时）→ createWindow(boot)
boot：托管 URL + 令牌经 preload 暴露 window.wbfm，前端据此直连托管服务
```

**为什么内置真实 Node**：Electron `fork` 默认以 Electron 内置 Node（ABI 125）运行子进程，与归集的 `node_modules`（Node 24 / ABI 137 编译的 better-sqlite3）`NODE_MODULE_VERSION` 不匹配，dlopen 直接失败。`scripts/prepare-server.mjs` 打包时把构建同版本 `node.exe` 复制进 `resources/server/node/`，fork 显式 `execPath`，ABI 天然一致（`config.resolveNodeRuntimePath`，未打包回落 Electron 默认）。

## 安全配置

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；生产不自动开 DevTools，不加载远程页面。
- 服务仅绑定 `127.0.0.1` 随机端口；令牌守卫在 `apps/web/src/lib/server/token-guard.ts`：仅 `WBFM_SERVER_MANAGED=1` 时强制校验 `x-wbfm-token`，缺失/无效返回 `UNAUTHORIZED`（非托管 Web 模式放行）。
- 单实例锁：`WBFM_USER_DATA_DIR` 覆盖 userData 先于 `requestSingleInstanceLock`（锁基于 userData 路径，支持测试隔离）；二次启动聚焦已有窗口。

## 退出时序

```text
before-quit → 保存窗口状态（captureWindowState → userData JSON）
will-quit → managedServer.stop()（SIGTERM→5s→SIGKILL，确保端口回收）→ cipherEndpoint.close() → app.exit(0)
```

## 打包与冒烟

- `electron-builder.yml`：`files` 仅 dist 与 package.json，asar 开启，服务端经 `extraResources` 放入 `resources/server`。
- `scripts/prepare-server.mjs`：归集 standalone（monorepo 嵌套布局 `apps/web/server.js`）+ 补齐 `.next/static` 与 `public` + 内置 Node 运行时。
- `scripts/run-e2e.mjs` 一键 E2E；Smart App Control 开启时（未签名 exe 被系统拦截）自动降级：以字节不变的官方签名 electron.exe 复制为宿主加载 app.asar，`app.isPackaged` 行为与真实打包等价（详见 docs/development.md）。
