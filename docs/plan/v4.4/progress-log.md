# v4.4 进度日志

> 方案：[README.md](./README.md) · Tasks：[tasks.md](./tasks.md) · Spec：[spec.md](./spec.md)
> 分支：`feat/v4.4-background-and-wallpaper`

## 状态

| 里程碑 | 状态 | 日期 |
|---|---|---|
| M0 方案与转正 | 🚧 进行中 | 2026-11-17 |
| M1 背景模型与内置素材 | 🚧 进行中 | 2026-11-17 |
| M2 本地图片/视频 | ✅ 完成（渲染层回退在 M4） | 2026-11-17 |
| M3 `wallpaper-pack` | ✅ 完成 | 2026-11-17 |
| M4 渲染接线 | ✅ 完成 | 2026-11-17 |
| M5 设置页 | ✅ 完成 | 2026-11-17 |
| M6 收尾 | 待开始 | — |

## 记录

### 2026-11-17 M0 方案

- 依据候选 12 与七项已决策口径落盘方案、Spec、Tasks。
- 版本目标：舞台/小剧场、主窗口聊天与整屏（互斥）、桌宠窗三处背景；内置素材 + 本地文件 + `wallpaper-pack` 三条来源。
- 约束：仅桌面端自定义文件；视频仅 MP4/H.264，用户单文件 ≤50MB，内置 ≤10MB；零数据库迁移。

### 2026-11-17 M1 背景模型与内置素材

- shared：新增 `schemas/media/background.ts`（三种来源、三作用域、fit/dim/blur 边界、主窗口 chat/window 互斥），接入 `settingsUpdateSchema` 与 `AppSettings`。
- 测试：`background.test.ts` 6 项通过；shared typecheck 通过。
- 内置：`public/backgrounds/rainy-room.mp4` 已落盘（6.42MB，来自雨夜客厅循环）；`wallpaper.dusk` / `wallpaper.morning` 先用程序化渐变，避免角色图与 VRM 叠加。
- 待补：`check:assets` 媒体预算表与视频体积校验。

### 2026-11-17 M2 本地图片/视频

- shared：新增 `bridges/background.ts`（`WbfmBackgroundBridge`、id 规则与内容类型映射），补齐 `./background` 子路径导出。
- desktop：新增 `main/background/`，选择后复制到 `<dataRoot>/backgrounds`；扩展名白名单、图片 20MB / 视频 50MB 上限、magic 嗅探、uuid 命名、列表与删除；仅主窗可调用。
- preload：暴露 `window.wbfm.background`；web 类型声明同步。
- web：新增 `GET /api/backgrounds/[id]`，按 uuid + 白名单扩展名校验后读取 `<dataRoot>/backgrounds`，缺失 404。
- 测试：desktop 背景 9 项、web 路由 3 项通过；desktop 全量 227 项、shared/desktop typecheck、行数与结构门禁通过。
- 说明：渲染层的缺失回退与视频暂停策略在 M4 接入。

### 2026-11-17 M3 `wallpaper-pack`

- shared：新增 `wallpaper-pack` payload 契约（1–10 个背景、`wallpaper.` 前缀、图片/视频与扩展名匹配、CC0/CC-BY 白名单、单文件 50MB / 合计 200MB）；能力类型、权限 `wallpaper:pack`、固定 entry 与中英文案同步。
- core：新增 effect `effects/wallpaper-pack/`（payload 解析、路径越界、资源存在与预算校验、启停）与 `services/media/wallpaper-content/`（按启用行聚合、冲突 fail-closed、`wallpapers:<sha256>` 快照、受控资源读取）。
- web：新增 `/api/wallpaper-content` 与 `/api/wallpaper-assets`。
- 样例：`buildSampleWallpaperPack()` 带 1 张 1x1 PNG（CC0）。
- 测试：shared 5 项、core 壁纸包 4 项 + 快照 3 项通过；core/shared/web typecheck、行数与结构门禁通过。

### 2026-11-17 M4 渲染接线

- 新增 `features/background/`：解析纯函数、设置/文件/壁纸包 hook、视频暂停与 dim/blur 渲染层，以及主窗口/桌宠/舞台三个适配组件。
- 舞台：配置为 `none` 时继续使用剧集 `StageBackgroundLayer` 与 `TheaterBackdrop`；配置后接管底层。
- 主窗口：聊天模式只铺内容区，整屏模式铺满窗口；由同一 `mode` 互斥切换。
- 桌宠：独立作用域，默认 `none` 保持透明；命中区与点击穿透未改。
- 解析规则：本地文件优先于包内资源；缺失时主窗口/舞台回退内置视频，桌宠保持透明。
- 测试：背景解析 6 项通过；舞台/桌宠/背景相关 121 项通过；web typecheck、行数与结构门禁通过。

### 2026-11-17 M5 设置页

- 新增「外观 → 背景与壁纸」面板：主窗口/舞台/桌宠三作用域切换，主窗口含聊天/整屏互斥模式。
- 来源支持内置（视频/渐变）、本地文件与壁纸包；提供铺放方式、压暗、模糊、实时预览与恢复默认。
- 桌面端可调用 `background.pick` 选择并复制，失败按超限/格式/复制失败提示；Web 模式显示仅桌面端可用。
- i18n 新增 `background` 命名空间与中英文案；设置目录与注册表接入，页内搜索可命中「背景/壁纸/wallpaper」。
- 测试：面板 2 项、设置域 44 项、i18n 30 项通过；web/shared typecheck、行数与结构门禁通过。

### 2026-11-17 图集接入

- 素材：用户提供 28 张场景图，原始 75.7MB；`scripts/assets/build-gallery.mjs` 统一压到 1920px 宽、WebP q80，输出 5.06MB（约 93% 降幅）。
- 清单：生成 `features/background/gallery.ts`（AUTO-GENERATED），id 为 `wallpaper.gallery.01–28`，标签按关键词归并。
- 设置：内置来源新增「内置图集」分组；`builtin` id 校验放宽为 `wallpaper.*`，避免图集被 schema 拒绝。
- 验证：背景与 shared 11 + 6 项测试通过；web/shared typecheck、行数与结构门禁通过。

### 2026-11-17 桌宠窗改 9:16

- 桌宠窗固定尺寸由 260×400（13:20）改为 270×480（9:16），便于生成同比例背景图与循环视频。
- 取景沿用 `vrm-fit`：按容器宽高自动缩放并脚底贴底，9:16 下仍完整入画；命中区、拖拽与位置钳制均按常量计算。
- 生成建议：2x 540×960、3x 810×1440；视频 720×1280、MP4/H.264。
- 验证：desktop 227 项测试、typecheck、行数与结构门禁通过。

### 2026-11-17 桌宠背景素材压缩

- 视频 2 个（480×854、60fps、5.06s、4.4–5.0Mbps）：ffmpeg 转 30fps、H.264 CRF 22、去音轨、faststart，2.7/3.06MB → 0.26/0.32MB。
- 图片 3 张（1440×2560 PNG）：sharp 压到 810×1440 WebP q80，0.6/1.44/2.02MB → 20/38/63KB。
- 接入：新增「桌宠背景」内置分组（2 个循环视频 + 3 张静态），id 为 `wallpaper.pet.*`；桌宠默认仍为 `none` 保持透明。
- 验证：背景与设置面板 8 项测试、web/shared typecheck、eslint、行数与结构门禁通过。
