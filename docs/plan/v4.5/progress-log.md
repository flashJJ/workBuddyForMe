# v4.5 Progress Log

## 2026-11-17

- 完成调研与选型：独立无边框 `BrowserWindow` + 本地 HTML；日常 SVG，首启 8s《潮汐开门》视频；Lottie/Rive/视频解码依赖不引入。
- 确定产品决策：日常紫团子；首次安装/覆盖升级首启播 8s 完整片；片源复用为内置视频壁纸；营销长片与启动分离。
- 收到即梦生成视频：854×480、60fps、H.264 + AAC、8.06s、6.27MB。
- 资源优化：去音轨、30fps、CRF 24、faststart，输出 `apps/desktop/resources/splash/cinema.mp4` 581KB；封面 `poster.webp` 26KB。
- 从 `main`（`2a7f7c3b`）切出 `feat/v4.5-boot-animation`。
- 记录风险：素材仅 480p，150% DPI 下会轻微软化；不强行放大，避免体积与伪影。
- 未提交的 `docs/film/` 与根 `README.md` 影视入口改动属于另一条工作线，已通过 stash 暂存，不进入本版提交。
- 下一步：M1 窗口/阶段桥/预加载/主窗交接，先跑通「有画面、能交接、失败可见」。

### M1 实施记录

- 新增 `apps/desktop/src/main/splash/`：`boot-phases`（阶段/模式/9000ms 契约）、`splash-window`（640×360 无边框窗 + IPC）、`splash-labels`（shared i18n）、`splash-timing`（本地日志）、`boot-session`（窗口/交接/耗时收口）。
- `index.ts` 接入：启动最先建 splash → 版本清理 → 阶段上报 → 主窗受控 reveal；`session-reset` 抽出后 index 292 行。
- 新增 `preload/splash.ts`，只暴露 `onMode/onPhase/onDone/onFail/notifyExited/skip`。
- 新增 `resources/splash/`：紫团子 + 三卡 SVG、8s 视频双层交接、跳过、500ms 最小可见、9s 上限、reduced-motion/高对比降级；CSP 仅允许本地资源。
- 打包接线：tsup 增加 `preload/splash`；electron-builder `extraResources` 增加 `resources/splash → splash`。
- 测试：splash + session-reset 单测 17 项通过；desktop 全量 39 文件 244 项、shared 48 文件 413 项通过；`pnpm check` 全绿；`check:lines` 通过（index 292 行）；lint 0 error。
- 实机开发态联调：Electron 640×360 窗口出现，阶段文案更新到「正在载入工作台」，主窗出现后 splash 关闭；强制 full 模式下视频铺满、9.5s 后交接。
- 已知限制：素材 854×480，150% DPI 会轻微软化；Playwright 首个窗口早于 attach 时会漏检，e2e 用 `WBFM_SPLASH_DELAY_MS=800` 规避。
- 下一步：打包态 e2e、真机冷/热/升级与性能基线。

### 视频壁纸与打包验证

- 开机动画复用为内置主窗口视频壁纸：`apps/web/public/backgrounds/tidal-door.mp4`（581KB）+ `tidal-door.jpg`（53KB），注册 `wallpaper.main.tidal-door`；设置页「主窗口视频」可见，背景层循环播放、poster 兜底。
- 移除独立回放入口：`BootIntro` 收敛为 `full | compact`，菜单与 splash 回放代码不再保留。
- 打包态 e2e（v4.5 pack:dir 产物）：12/12 通过（smoke 5、splash 1、pet 4、computer-input 2）。
- 打包态视频壁纸验证：设置页「主窗口视频」可见「潮汐开门（开机动画）」，预览解析为 `/backgrounds/tidal-door.mp4`。
- v4.5 `perf:baseline`（同机、临时数据根、两次启动）：
  - 首次安装：splash 429ms，mainPage 2572ms，mainVisible 9094ms（8s《潮汐开门》），chat 9281ms。
  - 日常启动：splash 493ms，mainPage 1900ms，mainVisible 2307ms，chat 2366ms；内存 694→707MB，峰值 728MB。
- v4.4 同机基线（安装版 4.4.0，`%LOCALAPPDATA%\Programs\WorkBuddyForMe`，同样临时数据根）：
  - 日常：mainPage 15449ms，mainVisible 15454ms，chat 15517ms；内存 678→664MB，峰值 702MB。
  - 首次：mainPage 15437ms，chat 15608ms。
  - 为排除路径因素，把安装产物复制到本地 `release/v44-baseline` 复测：日常 mainVisible 15367ms、chat 15522ms，仍在 15s 量级。
- 对比口径注意：v4.4 是已安装的 4.4.0 产物，v4.5 是本地 `release/win-unpacked`；两侧体积同为约 864MB，但 v4.4 的 15s 明显高于 v2.6 历史 5.6s，说明该安装产物的构建批次本身存在差异，不能当作纯代码差异。v4.5 日常 2.3s 是当前同机可复现值。
- 下一步：真机安装/覆盖升级、150% DPI 与 reduced-motion 手测。
