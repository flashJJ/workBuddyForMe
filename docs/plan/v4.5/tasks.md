# v4.5 Tasks

> 勾选即代表有代码/文档/测试证据；M0 未完成前不改发布口径。

## M0 取证与冻结

- [x] 启动链路取证与选型（00 文档）
- [x] 需求决策：紫团子日常、8s《潮汐开门》首启、片源复用为视频壁纸
- [x] 视频终稿与提示词（00 文档 §6.9）
- [x] 视频资源转码：`cinema.mp4` 854×480 / 30fps / 无音轨 / 581KB
- [x] 封面：`poster.webp` 26KB
- [x] 分支 `feat/v4.5-boot-animation`
- [x] e2e 改造清单确认（`waitForMainWindow` / `WBFM_SPLASH_DELAY_MS`）
- [x] v4.4 同机 `perf:baseline` 基线（安装版 4.4.0，见 progress-log）
- [ ] 分镜与 SVG 样片正式评审

## M1 可见闭环

- [x] `splash-window.ts`：窗口创建/显示/关闭、选项组装
- [x] `splash-bridge`：模式/阶段/完成/失败/退出 IPC（含阶段补发）
- [x] `boot-phases.ts`：阶段映射、模式判定、9s 上限
- [x] `splash-timing.ts`：打点与日志轮转
- [x] `preload/splash.ts`：只读桥
- [x] `index.ts` 接线：最早创建、阶段上报、失败收口、二次实例
- [x] `boot-session.ts`：窗口/阶段/交接/耗时收口，index 保持 ≤300 行
- [x] `session-reset.ts`：版本缓存清理与首启判定
- [x] `window.ts`：受控 reveal
- [x] `resources/splash`：HTML/CSS/JS + 日常 SVG
- [x] `tsup.config.ts` / `electron-builder.yml`：入口与打包
- [x] shared i18n 启动文案
- [x] 单测：boot-phases / splash-window / splash-timing / session-reset（17 项）
- [x] e2e：`waitForMainWindow` + `splash.spec.ts`
- [x] smoke / pet-window / perf-baseline 改造
- [x] 打包态 e2e 实跑（12/12）

## M2 动画与降级

- [x] 日常 SVG 分镜动画
- [x] 首启 8s 视频双层交接
- [x] 跳过（点击/Esc/Enter）
- [x] 最小可见 500ms
- [x] `prefers-reduced-motion` 与高对比
- [x] 8s 片尾 / 9s 上限 / 等待态切换
- [ ] 真机 reduced-motion / 高对比手测

## M3 差异化与可观测

- [x] 首启/日常模式判定
- [x] 片源复用为内置视频壁纸 `wallpaper.main.tidal-door`
- [x] `userData/boot-timing.log`
- [x] `perf:baseline` 输出 `splashVisibleMs` / `mainPageMs` / `mainVisibleMs`（首启与日常两次）
- [x] 打包态 e2e 实跑（12/12）
- [x] 视频壁纸在设置页手测（打包态：选项可见，预览解析为 `/backgrounds/tidal-door.mp4`）

## M4 验收与发布

- [x] 安装包构建与归档（`E:\builds\archive\v4.5.0`，273.22 MB）
- [x] 覆盖安装后首启动画不展示修复（`intro-seen-version` + `runAfterFinish: false`，4.5.1）
- [x] `pnpm check` + 全量测试
- [ ] 打包态真机：冷启动/热启动/覆盖升级
- [ ] 150% DPI、高对比、减少动态、中英双语
- [x] release notes、版本总结、博客
