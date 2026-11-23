# v4.5 Spec：启动画面与开机动画

> 契约文档。实现以本文件为准；与 [README](./README.md)、[调研与选型](./00-开机动画调研与技术选型.md) 冲突时，先改本文件再改代码。

## 1. 范围

桌面端启动画面（Splash）与首启品牌短片。零数据库迁移、零新 API 路由、零第三方运行时依赖；Web 端不改。

## 2. 窗口契约

| 项 | 值 |
|---|---|
| 尺寸 | 640 × 360（16:9），居中 |
| 边框/透明 | `frame: false`、`transparent: false` |
| 缩放/移动 | 禁止 |
| 任务栏 | `skipTaskbar: true` |
| 置顶 | 否，创建后 `moveTop()` |
| 显示 | `show: false` → `ready-to-show` → `showInactive()` |
| 关闭 | 允许；主窗未就绪时关闭视为取消启动 |
| 安全 | `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`devTools: false` |
| 背景 | `#0F1115`，与主窗 `backgroundColor` 一致 |
| 标题 | `WorkBuddyForMe · 启动中`（e2e 可用 URL 含 `/splash/` 识别） |

## 3. 模式

| 模式 | 触发 | 行为 |
|---|---|---|
| `compact` | `intro-seen-version` = 当前版本 | 只播 SVG 日常分镜；主窗 `ready-to-show` 即退场，最小可见 500ms |
| `full` | 首次安装，或 `intro-seen-version` ≠ 当前版本 | 播 8s《潮汐开门》；主窗后台就绪后继续到片尾或 9s 总上限；可跳过 |

`last-version` 只负责升级后的 session 缓存清理；`intro-seen-version` 只在启动画面真正显示并 reveal 后写入，避免安装器自动拉起、窗口被挡住或用户提前退出时把首启动画「消费」掉。

同一份 `cinema.mp4` 另存为 `apps/web/public/backgrounds/tidal-door.mp4`，在背景设置里作为主窗口视频壁纸 `wallpaper.main.tidal-door` 复用；不再提供独立回放入口。

## 4. 内部阶段与用户阶段

| 用户阶段 | 内部 stage | 触发点 |
|---|---|---|
| `prepare` 准备运行环境 | `app-ready` → `session-cleared` → `cipher-ready` | 启动入口、版本缓存清理、密码桥就绪 |
| `server` 启动本地服务 | `server-forked` → `server-healthy` | 托管服务 fork、健康检查通过 |
| `workspace` 载入工作台 | `main-created` → `main-ready` | 主窗创建、`ready-to-show` |

阶段只前进不回退；同一用户阶段重复上报时去重。

## 5. IPC 契约

| 通道 | 方向 | 载荷 |
|---|---|---|
| `boot:mode` | 主 → 画面 | `BootMode` |
| `boot:phase` | 主 → 画面 | `BootPhaseEvent` |
| `boot:done` | 主 → 画面 | 无 |
| `boot:fail` | 主 → 画面 | `BootFailure` |
| `boot:exited` | 画面 → 主 | 无 |
| `boot:skip` | 画面 → 主 | 无 |

```ts
export type BootIntro = 'full' | 'compact';
export type BootPhaseId = 'prepare' | 'server' | 'workspace';

export interface BootLabels {
  prepare: string;
  server: string;
  workspace: string;
  waiting: string;
  slow: string;
  verySlow: string;
  failed: string;
  failedHint: string;
  skip: string;
  version: string;
}

export interface BootTiming {
  minVisibleMs: number;
  maxIntroMs: number;
}

export interface BootMode {
  intro: BootIntro;
  lang: 'zh' | 'en';
  version: string;
  labels: BootLabels;
  timing: BootTiming;
}

export interface BootPhaseEvent {
  id: BootPhaseId;
  index: 0 | 1 | 2;
  total: 3;
  atMs: number;
}

export interface BootFailure {
  message: string;
  logPath?: string;
}
```

preload 仅暴露 `onMode` / `onPhase` / `onDone` / `onFail` / `notifyExited` / `skip`，不暴露 `ipcRenderer`、`process`、`require`。

## 6. 主窗交接

1. 主窗以 `show: false` 创建；`ready-to-show` 时只最大化，不 `show()`。
2. 主进程发送 `boot:done`。
3. 渲染层：
   - `compact`：立即播放 220ms 退场，发送 `boot:exited`。
   - `full`：若视频在播，继续到片尾或 9s 总上限；若主窗未就绪，切回等待态；随后退场。
4. 主进程收到 `boot:exited` 后 `mainWindow.show()`，再关闭 splash。
5. 主进程兜底：`boot:done` 后 1.5s 未收到 `boot:exited`，强制显示主窗并关闭 splash。

## 7. 失败与降级

| 场景 | 行为 |
|---|---|
| splash HTML 加载失败 | 记录日志，跳过画面，保持旧启动行为 |
| 视频缺失/解码失败/1s 内未 `canplay` | 回落到 SVG 分镜，不等待 |
| 主窗 30s 健康检查失败 | splash 错误态 600ms → 关闭 → 原 `dialog.showErrorBox` |
| 用户关闭 splash | 主窗已就绪则显示主窗；未就绪则取消启动并退出 |
| `prefers-reduced-motion` | 不自动播视频；静态首帧 + 阶段文案；无位移动画 |
| 高对比 | 文字纯白、卡片描边、关闭光晕 |

## 8. 路径与打包

| 资产 | 开发态 | 打包态 |
|---|---|---|
| `index.html` / `splash.css` / `splash.js` | `apps/desktop/resources/splash/` | `resources/splash/` |
| `cinema.mp4` / `poster.webp` | 同上 | 同上 |
| `tidal-door.mp4` / `tidal-door.jpg`（视频壁纸） | `apps/web/public/backgrounds/` | 随 standalone `public/backgrounds/` |
| splash preload | `dist/preload/splash.js` | asar 内 `dist/preload/splash.js` |

`electron-builder.yml` 增加 `extraResources: from resources/splash to splash`。

## 9. 性能与验收

- splash 首见：冷启动 ≤1.5s、热启动 ≤0.6s。
- 日常主窗可交互：相对 v4.4 同机基线不回退 >5%。
- 首启完整片：视频 8s，含首帧等待总时长 ≤9s；跳过即时生效。
- 内存：纯 SVG 峰值 ≤+100MB；含视频 ≤+150MB；关闭后常驻增量 ≤20MB。
- 资源：`cinema.mp4` 当前 854×480 / 30fps / 无音轨 / 581KB；`poster.webp` 26KB。
- `prefers-reduced-motion`、高对比、中英双语、失败路径手测通过。
- `pnpm --filter @wbfm/desktop typecheck`、定向 vitest、`pnpm check` 全绿。

同机实测（2026-11-17，临时数据根，packaged）：

| 版本/场景 | mainVisible | chat 可交互 | 峰值内存 |
|---|---|---|---|
| v4.5 首次安装（8s 完整片） | 9094ms | 9281ms | 829MB |
| v4.5 日常启动 | 2307ms | 2366ms | 728MB |
| v4.4.0 安装版日常（复制到本地复测） | 15367ms | 15522ms | 735MB |

> v4.4 是已安装的 4.4.0 产物（复制到本地 release 路径复测仍在 15s 量级），v4.5 是当前 `release/win-unpacked`。两侧体积同为约 864MB，但 v4.4 的 15s 明显高于 v2.6 历史 5.6s，说明安装产物/构建批次本身存在环境或构建差异，不能当作纯代码差异；这里只作为同机观察值。

## 10. 测试

- 单测：`boot-phases.test.ts`、`splash-window.test.ts`、`splash-timing.test.ts`。
- e2e：`splash.spec.ts`；`smoke.spec.ts` / `pet-window.spec.ts` / `perf-baseline.mjs` 改用 `waitForMainWindow`。
- e2e 专用 `WBFM_SPLASH_DELAY_MS=800`：让 Playwright 先 attach，避免首个窗口创建早于调试连接。
- 手测矩阵见 [00 文档 §10.4](./00-开机动画调研与技术选型.md)。
