# v4.4 进度日志

> 方案：[README.md](./README.md) · Tasks：[tasks.md](./tasks.md) · Spec：[spec.md](./spec.md)
> 分支：`feat/v4.4-background-and-wallpaper`

## 状态

| 里程碑 | 状态 | 日期 |
|---|---|---|
| M0 方案与转正 | ✅ 完成 | 2026-11-17 |
| M1 背景模型与内置素材 | ✅ 完成（媒体预算表待补） | 2026-11-17 |
| M2 本地图片/视频 | ✅ 完成（渲染层回退在 M4） | 2026-11-17 |
| M3 `wallpaper-pack` | ✅ 完成 | 2026-11-17 |
| M4 渲染接线 | ✅ 完成 | 2026-11-17 |
| M5 设置页 | ✅ 完成 | 2026-11-17 |
| M6 收尾 | 🚧 进行中（待真机验证） | 2026-11-17 |

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

### 2026-11-17 主窗口背景视频

- 新增 2 个主窗循环视频：深夜办公室（854×480、10.08s）、森林露营（854×480、5.06s）。
- 体积优化：三个视频统一 30fps、H.264 CRF 23、去音轨、faststart；6.42/6.71/3.08MB → 0.50/0.67/0.35MB（合计 1.52MB）。
- 接入：新增「主窗口背景」内置分组（`wallpaper.main.*`），雨夜仍保留在原内置项。
- 验证：背景与设置面板 8 项测试、web/shared typecheck、eslint 通过。

### 2026-11-17 桌宠木相框

- 有背景时显示纯 CSS 木纹圆角相框：外圆角 22px、内圆角 15px、框宽 7px，带投影与内外描边。
- 背景层同步内缩 7px 并裁圆角，视频/图片与画框对齐；无背景时保持透明、不渲染画框。
- 层级 z-15：盖住角色画布，低于字幕（z-20）与右键菜单（z-50）；`pointer-events-none` 不影响穿透。
- 验证：背景 6 项测试、web typecheck、eslint、行数门禁通过。

### 2026-11-17 M6 收尾

- 门禁修复：背景域 `hooks/` 子目录化（直接文件 13→10）；`ResolvedBackground` 定义移到 `builtin.ts`，消除 `builtin ↔ resolve` 类型循环；对外导出不变。
- 验证：结构门禁、相关 24 个测试文件 123 项、web typecheck 通过后，`pnpm check` 全绿；全量测试 9 包 745 文件 4218 项通过。
- 构建：web standalone → desktop tsup → prepare-server → electron-builder（临时 `electron-builder.local.yml` 复用本地 Electron 45.0.0 运行时，构建后删除）。
- 安装包（初版）：`WorkBuddyForMe-Setup-4.4.0.exe` 272.32MB（285,549,902 字节），归档 `E:\builds\archive\v4.4.0`；`release-manifest --check` 通过 3 个产物。
- 文档：新增 `release-notes.md`、`version-summary.md`，博客 `blog/v4.4/` 10 篇并登记索引。

### 2026-11-17 真机验证修复与重打包

- 问题 1：先保存来源、再只调模糊保存后背景变回默认。根因是设置写入按顶层字段整体替换 `background`，而面板第二次只提交当前作用域的局部 patch，`source/fit/dim` 被冲掉；改为每次保存提交三个作用域的完整配置，并保留主窗口 `mode`。
- 问题 2：整屏模式下侧边栏、页面头部与页内搜索不透明，背景无法贯通。新增 `MainBackgroundModeProvider`，整屏模式下侧边栏 `bg-card/70`、页面头部 `bg-card/60`、设置搜索区 `bg-background/40` 均加 `backdrop-blur`；聊天模式保持不透明。
- 回归：新增“二次保存保留已选源”测试；web 全量 285 文件 1445 项、全量测试 745 文件 4219 项通过；`pnpm check` 全绿。
- 样式统一（同轮真机反馈）：整屏背景模式改为单一开关 `data-main-background="window"`；侧边栏、页面头部、内容卡片与页内搜索共用 `globals.css` 中的同一组玻璃参数（alpha 0.72 / blur 14px），不再各组件各写一套透明类。
- 重打包：安装包 272.37MB（285,598,054 字节），SHA256 `ffe65ea6…18a804`；commit `1a22d129`；`release-manifest --check` 通过 3 个产物。
- 待办：真机验证通过后合并 main、打 tag `v4.4.0` 并推送工蜂。

### 2026-11-17 表面层级治理 S1

- 方案与登记：新增 `surface-system.md`（L0–L5 层级、token、门禁、迁移顺序）与 `surface-registry.md`（全局/共享组件/各模块初版登记）。
- 层级改为渐进透明度：L1 工作区/侧栏 0.66/0.60 + 模糊，L2 卡片 0.86，L3 行 0.92，L4 控件 0.96，L5 弹层实色；明暗两套，命名主题只继承。
- 新增 `--ui-canvas/chrome/card/row/control/overlay` 与 Tailwind `ui.*` 映射；工作区、侧栏、边框内容框先用 token。
- 新增 `scripts/check-surfaces.mjs` 与 `scripts/.surfaces-baseline.json`（330 处 / 170 文件），纳入 `pnpm check`；存量只降不升。
- 后续：S2 共享基座 → S3 首批模块 → S4 其余模块 → S5 基线清零。

### 2026-11-17 表面层级治理 S2/S3

- S2：Card、Button（outline）、Input、Textarea、NumberInput、Select、Dialog、Toast、EmptyState、ErrorState 切换到 `bg-ui-card/control/overlay`。
- S3：侧边栏、页面头部、聊天顶栏、迷你播放器、设置全模块、知识库、运行报告、助手与模板卡完成迁移；设置面板 `bg-card` → `bg-ui-card`，字段组/子块 → `bg-ui-row`，控件 → `bg-ui-control`。
- 列表/内容框：文档列表、上传拖拽区、报告筛选栏、模板卡补 L2 卡面。
- 门禁：`check:surfaces` 基线 330 → 232 处，settings 119 → 48；剩余集中在 chat、flow-editor、meetings 等 S4 模块。
- 验证：web typecheck 通过；设置/知识库/报告/助手 20 个测试文件 62 项通过。
