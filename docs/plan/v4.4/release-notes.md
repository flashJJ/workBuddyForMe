# WorkBuddyForMe v4.4.0 发布说明

> 版本：4.4.0（2026-11-17）
> 主题：背景与壁纸——三处独立背景、三源引入与素材收口
> 范围：M0 方案与转正 → M1 背景模型 → M2 本地图片/视频 → M3 `wallpaper-pack` → M4 渲染接线 → M5 设置页 → M6 收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION` 与备份 schema 均不变。
> 状态：安装包已构建归档，待真机验证后发布 tag。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v4.4 方案、Spec、Tasks 与进度日志落盘；候选 12 转正并更新路线图索引 |
| M1 | 背景源模型（builtin/image/video）、三作用域设置与默认值；内置雨夜循环视频 |
| M2 | 桌面 IPC `background:pick/list/remove`；复制到数据目录、类型嗅探、体积上限与受控读取 |
| M3 | `wallpaper-pack` 能力类型：payload 契约、effect、内容快照与只读资源路由 |
| M4 | 舞台、主窗口（聊天/整屏互斥）、桌宠三处渲染接线；视频暂停与减少动态回落 |
| M5 | 设置「外观 → 背景与壁纸」面板：三作用域、来源选择、预览与恢复默认 |
| M6 | 全量测试、`pnpm check`、安装包构建归档、发布文档与博客 |

## 2. 用户可见变化

- 设置「外观」新增「背景与壁纸」：主窗口、舞台/小剧场、桌宠窗三个配置点各自独立保存。
- 主窗口支持「聊天」与「整屏」两种铺法，互斥切换，共用同一背景源。
- 来源支持：内置视频/渐变、内置图集 28 张、桌宠专用 5 个、主窗口专用循环视频 2 个、本地图片/视频、`wallpaper-pack` 包内壁纸。
- 桌面端可选择本地图片或 MP4 视频，复制入应用数据目录后长期可用；Web 模式只读内置素材。
- 背景支持铺放方式（cover/contain）、压暗（0–1）与模糊（0–20px）。
- 桌宠窗改为 9:16（270×480），开启背景时显示圆角木纹相框，背景层与画框对齐，不影响点击穿透。
- 背景视频静音循环；窗口隐藏时暂停，减少动态效果时回落到静帧。

## 3. 内部改动

- 契约：`shared/schemas/media/background/` 定义三种来源、三作用域、`fit/dim/blur` 边界与主窗口 `mode` 互斥；`builtin` id 校验为 `none` 或 `wallpaper.*`。
- 本地文件：主进程按 magic 嗅探类型（图片 ≤20MB、视频 ≤50MB），uuid 命名写入 `<dataRoot>/backgrounds`；Web 路由 `/api/backgrounds/[id]` 只接受 uuid + 白名单扩展名。
- 能力包：payload 1–10 项、`wallpaper.` 前缀、许可白名单 CC0-1.0/CC-BY-4.0、单文件 50MB / 整包 200MB；聚合版本 `wallpapers:<sha256>`，冲突 fail-closed。
- 渲染：`BackgroundLayer` 统一视频/图片/渐变，`visibilitychange` 与 `prefers-reduced-motion` 双重暂停；`dim` 以黑色遮罩、`blur` 以 CSS filter 实现，不作用于角色画布。
- 素材：图集压缩脚本 `scripts/assets/build-gallery.mjs`（1920px WebP q80）；视频统一 30fps、H.264 CRF22/23、去音轨、faststart。

## 4. 门禁结果

- 全量测试：9 个包 745 个测试文件 4219 项通过。
  - web 285 文件 1445 项；core 272 文件 1664 项；database 75 文件 283 项；shared 48 文件 413 项；desktop 35 文件 227 项；ai 16 文件 86 项；voice 9 文件 85 项；config 4 文件 14 项；motion 1 文件 2 项。
- 真机验证修复：背景二次保存只发局部 patch 会冲掉已选来源（改为每次提交三作用域完整配置）；整屏模式下侧边栏、页面头部、内容卡片与页内搜索统一为同一组玻璃表面参数（透明度/模糊集中在 `globals.css` 的 `data-main-background="window"` 规则）。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII、资产检查全部通过。
- 新增门禁回归：背景域 hooks 移入子目录（直接文件 13→10）；`builtin.ts ↔ resolve.ts` 类型循环依赖已消除。
- 迁移：零数据库迁移。

## 5. 已知限制

- 本地背景文件仅桌面端可用，Web 模式只读内置素材；
- 背景视频一律静音，不支持音轨；只接受 MP4/H.264，不做转码；
- `wallpaper-pack` 不做热替换，安装/停用后下一次读取生效；
- 暂无在线壁纸市场与远程下载，也不支持动态壁纸交互；
- `check:assets` 尚未接入背景媒体预算表（`background-budget.json` 待补）。

## 6. 安装包与校验

| 项目 | 值 |
|---|---|
| 安装包 | `WorkBuddyForMe-Setup-4.4.0.exe` 272.37 MB（285,598,054 字节） |
| 安装包 SHA256 | `ffe65ea6768a7a8abfe86e1eb4526fbeb849a37e13912cf2b223281ede18a804` |
| blockmap SHA256 | `cdf902e35e3b372d946c45eab1bbbc97cc94fe1399721e46f6cea0014ef8930e` |
| latest.yml SHA256 | `f1f4a0eaae7973ccf3a6a0c485ae70ba294efaeeaec5ca9b572f6b9ed6c9b4ac` |
| 归档目录 | `E:\builds\archive\v4.4.0` |
| build-info | commit `1a22d129`、branch `feat/v4.4-background-and-wallpaper`、构建时间 `2026-11-16T21:05:24Z` |
| 体积对比 | 较 v4.3.0 264.84MB 增加 7.53MB（7,892,989 字节），仍在 300MB 预算内 |
| 校验复核 | `node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.4.0` 输出「校验通过 3 个产物（4.4.0）」 |

## 7. 更新公告

本版把背景与壁纸做成可配置的一等能力：舞台、主窗口与桌宠窗可以各自选择内置素材、本地图片/视频或能力包壁纸，视频静音循环并在窗口隐藏时暂停。整屏模式下的侧边栏、头部、内容卡片与搜索统一为同一套玻璃表面样式。素材统一压缩后入包，安装包 272.37MB，仍在 300MB 预算内；没有数据库迁移，升级后首次启动无需额外操作。

## 8. 发布物料清单

| 物料 | 状态 | 要点 |
|---|---|---|
| 发布说明（本文） | 完成 | 安装包数据已按最终构建回填 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | `blog/v4.4/` 10 篇 |
| 安装包 | 完成 | 归档于 `E:\builds\archive\v4.4.0` |
| 校验和复核 | 已完成 | 输出「校验通过 3 个产物（4.4.0）」 |
| 真机验证 | 待执行 | 安装、启动、三作用域背景、本地文件、壁纸包、桌宠相框 |
| 截图 | 待补 | 背景设置面板、主窗口背景、桌宠相框、壁纸包安装 |
