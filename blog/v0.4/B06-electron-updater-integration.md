---
title: "electron-updater 接入实录：状态机收敛、窄桥 IPC 与开发态 no-op 门控"
series: "WorkBuddy For Me v0.4 技术拆解"
number: "B06"
tags: ["workbuddy", "electron", "auto-update", "ipc", "state-machine"]
date: "2025-Q4"
---

## 自动更新的本质：把一个第三方单例驯化成可测的状态机

electron-updater 本身是一个事件源单例：`autoUpdater.on('update-available', ...)`、`on('download-progress', ...)`、`on('error', ...)`，事件随时来、顺序不保证、还带着一个全局共享的单例对象。直接把它的事件转发到渲染进程，是最常见的写法，也是最难维护的写法——事件语义散落在七八个 listener 里，UI 端要自己拼接「现在到底处于什么状态」。

v0.4 的接入（[updater.ts](file:///e:/code/traeWork/workBuddyForMe/apps/desktop/src/main/updater.ts)，全部 159 行）做了三件事：把事件流收敛成显式状态机、把 IPC 收窄成白名单桥、把 electron-updater 藏在接口后面。这篇逐个讲。

---

## 一、状态机：六个状态，事件只是转移触发器

更新生命周期被收敛为一个判别联合 `UpdateStatus`：

```typescript
type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };
```

转移关系：

```text
idle → checking → available → downloading(0~100%) → downloaded → quitAndInstall
                ↘ not-available
        任意阶段 ↘ error（提示手动下载，不阻塞使用）
```

electron-updater 的事件在 `attachEvents()` 里被翻译成状态对象，**渲染进程永远看到的是一个完整的、自洽的状态**，而不是需要自己对时序的事件流：

```typescript
u.on('download-progress', (p) => {
  const percent = (p as { percent?: number } | undefined)?.percent ?? 0;
  this.send({ state: 'downloading', percent: Math.round(percent) });
});
```

注意这里对第三方数据的防御：`p.percent` 可能是 undefined（electron-updater 的类型声明和真实行为并不总一致），一律 `?? 0` 兜底。**第三方事件的载荷是不可信输入**，即使它来自一个知名库。

错误状态是终点但不是阻塞：error 状态在 UI 上显示「检查更新失败」+ 附 GitHub Releases 手动下载链接，应用本身照常用。自动更新是便利功能，它挂了不能影响主功能——**辅助子系统的故障必须局部化**。

---

## 二、窄桥 IPC：preload 白名单与「无窗口即丢弃」

渲染进程需要两类通道：查询/操作（invoke/handle）和状态订阅（event）。preload 里暴露的是一个白名单对象而不是 `ipcRenderer` 本体：

```typescript
// preload 暴露的桥（概念示意）
window.wbfm.updater = {
  getStatus: () => ipcRenderer.invoke('updater:get-status'),
  check:     () => ipcRenderer.invoke('updater:check'),
  download:  () => ipcRenderer.invoke('updater:download'),
  install:   () => ipcRenderer.invoke('updater:install'),
  setChannel:(c) => ipcRenderer.invoke('updater:set-channel', c),
  onEvent:   (cb) => { /* 订阅，返回取消订阅函数 */ },
};
```

主进程侧五个 `handle` 一一对应（见 `registerIpc`）。三个细节：

**1. 无窗口时静默丢弃。** 事件转发通过 `getMainWindow()?.webContents.send(...)`，窗口不存在时直接丢弃。更新检查在应用启动 10 秒后异步触发，此时窗口可能还没建完——如果 `send` 抛异常或排队等待，更新逻辑就会阻塞主进程启动。**状态已更新到内存（`this.status`），窗口晚来也能通过 `get-status` 拿到最新值**——事件是推送优化，状态查询才是真相源。

**2. `onEvent` 返回取消订阅函数。** React 组件的 `useEffect` 清理函数直接调它，避免组件卸载后回调还挂着（内存泄漏 + setState on unmounted 警告）。

**3. 类型契约放 shared。** `UpdateStatus`/`FullUpdaterStatus`/`WbfmUpdaterBridge` 都定义在 `packages/shared`，主进程 `updater.ts` 和渲染进程 `about-panel.tsx` 复用同一份类型——desktop 对 shared 是 type-only import，无运行时耦合，但**字段漂移在编译期就被拦住**。v0.3 时代吃过一次「主进程加字段、渲染端不知道」的亏，契约上移是那次教训的制度化。

---

## 三、接口隔离：AutoUpdaterLike 与 26 个单测

`updater.ts` 不直接 import electron-updater，而是定义一个接口：

```typescript
export interface AutoUpdaterLike {
  allowPrerelease: boolean;
  autoDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}
```

生产环境注入真实的 `autoUpdater` 单例；测试注入 `MockAutoUpdater`——一个 EventEmitter 子类，手写 `emit('update-available', {version: '0.5.0'})` 就能驱动完整状态流转。26 个单测覆盖了全状态机：检查→有更新→下载进度→下载完成→安装、通道切换同步 `allowPrerelease`、错误兜底、无窗口丢弃。

这种「把第三方单例藏在接口后面」的手法在项目里不是第一次用：v0.1 接密钥存储时就验证过。**单例不可测，接口可测**——尤其 electron 的单例还依赖运行时（`app` 必须 ready），单测里根本起不来。

---

## 四、开发态 no-op：一条 `isPackaged` 门控

```typescript
// main/index.ts 启动处
const updater = new Updater({
  autoUpdater,
  enabled: app.isPackaged,   // ← 开发态/测试态全为 false
  // ...
});
```

开发态所有更新操作是 no-op：`checkForUpdates` 直接返回 `not-available`，不请求 GitHub；`downloadUpdate`/`quitAndInstall` 直接返回。

这条门控不是优化，是**正确性要求**：开发时 electron-updater 如果真要下载安装，会去替换正在运行的 exe——dev 进程持有的文件锁会让安装失败，更糟的情况是装上了但你正在调试旧代码。测试态同理：E2E 测试里绝不能真的去请求 GitHub。

UI 层也感知这个门控：`FullUpdaterStatus.enabled` 下发到关于面板，开发态显示「开发模式，更新检查已禁用」，而不是装模作样地点了没反应。**禁用要可见，不可用却装作可用是最差的 UX。**

---

## 五、通道与持久化

stable/beta 通道偏好持久化在独立的状态文件（`updater-state.ts`），不落主库——它是桌面端运行期状态，跟 web 服务无关，也不该被 web 端的备份轨带走。Updater 构造时读出通道、同步到 `autoUpdater.allowPrerelease`；切换通道时落盘 + 同步一气呵成：

```typescript
setChannel(channel: UpdateChannel): UpdaterState {
  const next = persistChannel(this.opts.stateFile, channel);
  this.syncChannel(next.channel);   // allowPrerelease = (channel === 'beta')
  return next;
}
```

`lastCheckAt` 也在同文件里，关于面板显示「上次检查时间」，避免用户面对一个不知道死活的功能。

打包侧只有一行关键配置：`electron-builder.yml` 加 `publish: github`，builder 在发布时自动生成 `latest.yml` 并随 release 上传，electron-updater 按仓库地址自己找到它。未签名 exe 的 SmartScreen 警告留给 v1.0 的代码签名证书解决，本期明确不碰。

---

## 小结

electron-updater 接入的技术含量不在「调通」，而在驯化：事件流收敛成状态机（UI 消费状态而非事件）、IPC 收窄成白名单桥（preload 不暴露原生 ipcRenderer）、单例藏在接口后（26 个不依赖 electron 的单测）、`isPackaged` 一刀切开发态（正确性而非优化）。159 行代码 + 26 个测试，换来的是一个不会因为更新组件故障而影响主应用的自动更新。

下一篇 B07 是 v0.4 最血腥的一章：pdfjs 的 structuredClone transfer 如何在你不知情的情况下吃掉输入 ArrayBuffer——一个 mock 全绿、真机全灭的经典案例。
