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
| M4 渲染接线 | 待开始 | — |
| M5 设置页 | 待开始 | — |
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
