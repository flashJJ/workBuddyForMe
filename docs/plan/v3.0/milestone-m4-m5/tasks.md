# M4 / M5 Tasks

> 规格见 [spec.md](./spec.md)。按顺序执行，每步完成后勾选并跑对应验证。

## T1 小剧场数据与深链（M4-1）

- [x] 新建 `apps/web/src/features/stage/theater/theater-script.ts`：1 集 3 席（雪团 / 冉卡露丽 / 菲比，均内置 VRM）6 句、`findTheaterEpisode` / `parseTheaterSearch` / `theaterDirections`
- [x] 新建 `apps/web/src/features/stage/theater/theater-script.test.ts`：默认集、未知 ep 回落、directions 不越界、cast 槽位唯一、cast 全部 `isVrmAvatarId`
- [x] 新建 `apps/web/src/features/stage/theater/use-stage-theater.ts`：首播 cast、5.2s 轮播、循环、上一句/下一句/重播
- [x] `use-stage-controller.ts`：`StageMode` 增加 `theater`
- [x] `stage-root.tsx`：解析 `stage=play` / `ep`，接线 theater Hook 与分享卡
- [x] `stage-toolbar.tsx`：theater 标题与剧场控制区
- [x] `packages/shared/src/i18n/messages/stage.ts` / `stage-en.ts`：theater 与 shareCard 词条

## T2 分享卡（M4-2）

- [x] 新建 `apps/web/src/features/stage/theater/stage-share-card.tsx`：卡面 + 今日数据（失败显示 `--`）+ 保存/关闭
- [x] `stage-root.tsx`：分享卡开关与 `requestScreenshot` 接线
- [x] 新增 `stage-share-card.test.tsx`：标题/台词/数据缺失兜底/按钮在 `uiHidden` 时隐藏
- [x] 真机：`/stage?stage=play` 保存 PNG，卡面在、按钮不在

## T3 角色包验收（M4-3）

- [x] 验收现有 Markdown 导出/导入（文本 only、非法 frontmatter 不落库、无代码执行）
- [x] 在 spec/roadmap 记录「角色包不含代码」结论（无代码改动）

## T4 剧本 lint + golden（M5-1）

- [x] 新建 `apps/web/src/features/avatar/script/scenes/lint.test.ts`：id 唯一、触发键、优先级/冷却、时间单调、line 存在、prop 成对、`validateScene` 零丢弃、branch 递归
- [x] 新建 `apps/web/src/features/avatar/script/scenes/golden.test.ts`：`id → [{at, kind}]` 快照
- [x] root `package.json` 增加 `check:scenes`
- [x] 跑 `pnpm check:scenes`，必要时首次生成快照

## T5 合规声明（M5-2）

- [x] `about-panel.tsx`：新增原创角色/二创包声明块（两个分支都渲染）
- [x] i18n `about.compliance.*` 中英文

## T6 版本与发布（M5-3）

- [x] root `package.json` → 3.0.0，`pnpm sync-version`，`pnpm sync-version:check`
- [x] 新建 `docs/plan/v3.0/release-notes.md`：M0–M5 要点、门禁结果、已知限制、物料清单与大纲
- [x] 更新 `execution-roadmap.md`（M4/M5 状态）与 `progress-log.md`（工作日志）

## T7 验证与门禁

- [x] `pnpm --filter @wbfm/web test -- src/features/stage src/features/avatar/script/scenes`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm check:lines` / `pnpm check:structure` / `pnpm check:cycles` / `pnpm check:ascii`
- [x] 真机 `/stage?stage=play`：cast、轮播、控制、分享卡、PNG 保存
- [x] 清理临时脚本与截图产物

## 验证记录（2026-11-14）

- 单测：舞台 + 场景 + 设置存储 12 文件 62 项通过；`pnpm check:scenes` 6 文件 37 项通过。
- 类型：web typecheck 通过；lint 8 包 0 error。
- 门禁：行数 / 结构 / 循环 / ASCII 全绿（`stage/` 直接文件仍 21，新代码在 `stage/theater/`）。
- 真机（`http://127.0.0.1:42337/stage?stage=play`，Electron CDP 42338）：
  - `data-mode=theater`，角标 1/6 → 2/6 自动推进；上一句/下一句/重播正常；
  - 三席 VRM：冉卡露丽（左）/ 雪团（中）/ 菲比（右）；
  - 分享卡显示「今日主动播放 3/3、今日生成 5」；关闭可收起；
  - 保存 PNG 经原生对话框落盘（`wbfm-stage-2026-11-14-05-50-39.png`），卡面完整、保存/关闭按钮未入镜。
- 分享卡接口失败态由单测覆盖（显示 `--`），真机接口 200 时正常出数。
- 修复：舞台 VRM 固定 `motionProfile="stage"`，只加载内置 `daiji` 并剔除腿/脚/趾/指轨道、关闭待机余兴、固定外旋站姿；修正 VRMA 归一化轨道名下的手臂动画判定。真机 `poolSize=1`、12 条轨道，三席手指自然、双脚分开。
