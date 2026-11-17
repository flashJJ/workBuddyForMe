# WorkBuddyForMe v4.5.1 发布说明

> 版本：4.5.1（2026-11-17）
> 主题：一眼启动——启动画面、真实阶段反馈与品牌开机短片
> 范围：M0 调研与冻结 → M1 可见闭环 → M2 动画与降级 → M3 差异化与可观测 → M4 验收与发布
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51`，备份 schema 不变。
> 状态：安装包已构建归档；覆盖安装首启动画修复已实测。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | 启动链路取证、技术选型、8 秒《潮汐开门》分镜与提示词、视频/封面转码 |
| M1 | 640×360 无边框启动窗、preload 只读桥、三阶段事件、主窗受控 reveal、失败兜底 |
| M2 | 紫团子 SVG 日常动画、首启 8 秒视频双层交接、跳过、最小可见、减少动态/高对比降级 |
| M3 | 首启/日常模式判定、`userData/boot-timing.log`、`perf:baseline` 首启与日常双采样、片源复用为视频壁纸 |
| M4 | 打包态 e2e 12/12、安装包归档、覆盖安装首启动画修复（4.5.1） |

## 2. 用户可见变化

- 双击应用后不再长时间没有任何窗口：冷启动约 1 秒内出现品牌启动画面，并显示真实启动阶段。
- 首次安装或覆盖升级后的首次启动播放 8 秒《潮汐开门》完整短片；日常启动使用精简版，主窗就绪即退场。
- 启动画面支持点击任意处、`Esc`、`Enter` 或空格跳过；完整片总时长上限 9 秒。
- 启动超过 8 秒/20 秒时给出“仍在启动”的可读提示；启动失败时先在启动画面显示原因和日志路径，再走原错误对话框。
- 《潮汐开门》片源同时作为内置主窗口视频壁纸「潮汐开门（开机动画）」，循环播放、封面兜底。
- 4.5.1 修复：覆盖安装后不再由安装器自动拉起应用，避免安装完成页挡住启动画面；首次手动启动会补播完整片。
- 安装完成后需要手动打开应用；这是 `runAfterFinish: false` 的有意行为，不是启动失败。

## 3. 内部改动

- 启动画面：独立 `BrowserWindow`（640×360、无边框、不透明、`skipTaskbar`、`sandbox` + `contextIsolation`），加载本地 HTML/CSS/JS；`show: false`，`ready-to-show` 后 `showInactive`。
- 阶段契约：`prepare / server / workspace` 三段由主进程真实事件驱动，内部 stage 含 `app-ready / session-cleared / cipher-ready / server-forked / server-healthy / main-created / main-ready`；不显示伪造百分比。
- 主窗交接：主窗 `deferShow`，启动画面收到 `boot:done` 后播放 240ms 退场，主进程 `revealMainWindow` 再显示主窗，完成后关闭 splash。
- 双动效：日常 SVG/CSS；首启 1 秒内 `canplay` 才切视频层，否则直接使用 SVG 等待态；视频失败自动回落。
- 首启判定：新增 `intro-seen-version`，只在启动画面真正显示且主窗 reveal 后写入；`last-version` 继续只负责升级后清 session 缓存。
- 安装器：NSIS `runAfterFinish: false`，覆盖安装不自动拉起；卸载/静默安装行为不变。
- 可观测：`userData/boot-timing.log` 记录最近 20 次启动阶段耗时，只写本地、不上报。
- 测试：`waitForMainWindow` 统一过滤 `/splash/` 窗口；splash e2e 使用 `WBFM_SPLASH_DELAY_MS` 解决 Playwright 早于 attach 的漏检；`perf:baseline` 改为同一临时数据根跑首启与日常两次。
- 素材：即梦原片 854×480 / 60fps / 6.27MB，转码为 854×480 / 30fps / 去音轨 / CRF24 / faststart，581KB；封面 WebP 26KB。

## 4. 门禁结果

- 单测：splash 20 项通过；desktop 全量 247 项、shared 413 项通过。
- 打包态 e2e：12/12 通过（smoke 5、splash 1、pet 4、computer-input 2）。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII、资产、表面样式全部通过。
- 覆盖升级实测：临时 `userData` 预置 `last-version=4.5.0`、无 `intro-seen-version`，启动 4.5.1 后 `boot-timing` 为 `mode:"full"`（`server-healthy 14445ms`、`main-ready 17472ms`），reveal 后写入 `intro-seen-version=4.5.1`，主窗进入 `/chat`。
- 性能基线（同机、临时数据根）：
  - 首启完整片：splash 429ms、mainPage 2572ms、mainVisible 9094ms、chat 9281ms；
  - 日常：splash 493ms、mainPage 1900ms、mainVisible 2307ms、chat 2366ms；内存 694→707MB，峰值 728MB。
  - v4.4 安装版同机日常约 15.4 秒，明显高于历史 v2.6 的 5.6 秒，属于该安装产物构建批次差异，不作为纯代码对比。

## 5. 已知限制

- 片源为 854×480，150% DPI 或整屏视频壁纸下会轻微软化；不强行放大，避免体积与伪影。
- 启动画面固定品牌深色，不跟随用户主题；启动音效本版不做。
- 完整片只在首次安装/覆盖升级首启播放一次，不提供菜单回放；片源已作为视频壁纸保留。
- 首启完整片最多 9 秒；如果主窗仍未就绪，启动画面回到等待态，不黑屏。
- 750% 以上缩放、macOS/Linux 专项观感未纳入本版验收。

## 6. 安装包与校验

| 项目 | 值 |
|---|---|
| 安装包 | `WorkBuddyForMe-Setup-4.5.1.exe` 273.22 MB（286,493,155 字节） |
| 安装包 SHA256 | `c5dc07acaecc1fd1e3b047e183e9b18210a4f94815b38d97630cf114717acefd` |
| blockmap SHA256 | `377ae38ee5da8c7157bf24293854bfdf68799fe7a88d40bae60f211a31ce920b` |
| latest.yml SHA256 | `732a0b574e932b3b90790a22d5ce68b6ec9855302f01c2b679e092b83bdf3ce8` |
| 归档目录 | `E:\builds\archive\v4.5.1` |
| build-info | commit `275c2c2f`、branch `feat/v4.5-boot-animation`、构建时间 `2026-11-17T14:25:55Z` |
| 上一版 | 4.5.0 安装包 286,492,630 字节，SHA256 `41e02c20…ff5622`；4.5.1 仅修复首启动画判定与安装器行为 |
| 校验复核 | `node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.5.1` 输出「校验通过 3 个产物（4.5.1）」 |

## 7. 更新公告

本版把“双击之后什么都没有”的启动空窗改成一条可见的状态链：640×360 品牌启动画面先出现，随后按真实阶段显示“准备环境 / 启动本地服务 / 载入工作台”。首次安装或覆盖升级首启播放 8 秒《潮汐开门》，日常启动则在主窗就绪后立即退场；完整片可随时跳过，超过 9 秒回到等待态。片源同时复用为主窗口视频壁纸。4.5.1 修复了覆盖安装后动画被安装器挡住、首启被提前消费的问题；安装完成后请手动打开应用查看首启动画。零数据库迁移，升级不需要额外操作。

## 8. 发布物料清单

| 物料 | 状态 | 要点 |
|---|---|---|
| 发布说明（本文） | 完成 | 4.5.1 安装包数据已回填 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | `blog/v4.5/` 7 篇 |
| 安装包 | 完成 | 归档于 `E:\builds\archive\v4.5.1` |
| 校验和复核 | 完成 | manifest 3 个产物通过 |
| 真机验证 | 待执行 | 冷启动、热启动、覆盖升级、150% DPI、减少动态、高对比、中英双语 |
| 截图 | 待补 | 日常启动画面、首启短片、启动失败态、视频壁纸 |
