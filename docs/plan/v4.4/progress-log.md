# v4.4 进度日志

> 方案：[README.md](./README.md) · Tasks：[tasks.md](./tasks.md) · Spec：[spec.md](./spec.md)
> 分支：`feat/v4.4-background-and-wallpaper`

## 状态

| 里程碑 | 状态 | 日期 |
|---|---|---|
| M0 方案与转正 | 🚧 进行中 | 2026-11-17 |
| M1 背景模型与内置素材 | 🚧 进行中 | 2026-11-17 |
| M2 本地图片/视频 | 待开始 | — |
| M3 `wallpaper-pack` | 待开始 | — |
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
