# WorkBuddyForMe v3.1.0 发布说明

> 版本：3.1.0（2026-11-15）
> 主题：可插拔前置——能力/provider 注册表与动效内容注入
> 范围：M0 方案与归档 → M1 能力 handler 注册表 → M2 provider 注册表 → M3 动效内容快照 → M4 门禁与发布收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51` 与备份 schema 均不变。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v3.1 方案落盘；候选 05/06 移入 `docs/roadmap/scheduled/` 并更新三处索引 |
| M1 | 六类能力 effect 从 `switch (kind)` 改为 `CapabilityEffectHandler` 注册表；新增 kind 只需注册 handler |
| M2 | 模型 provider 从 `switch (protocol)` 改为 protocol → factory 注册表；未知协议错误语义不变 |
| M3 | `VrmAnimationRuntime` 接受 `MotionContent` 快照；`SCRIPT_PRIMITIVES` 由同一快照派生，默认 golden 零差异 |
| M4 | 相关单测与 `pnpm check` 全绿；v3.1 发布说明、版本总结与 10 篇博客 |
| 附带 | 舞台三模式默认形象统一为内置 VRM；舞台入口转正式，自由舞台与小剧场双向切换 |

## 2. 用户可见变化

- 裸 `/stage` 的“演示舞台”更名为“自由舞台”，手动控制分组改为“自由操控”。
- 自由舞台、协作 run、会议三种模式的默认角色统一为内置 VRM（冉卡露丽 / 雪团 / 菲比）；会议按槽位分配，避免整场同一模型。
- 桌面托盘“全屏舞台”改为子菜单：自由舞台 / 小剧场，已开窗时也会导航到对应模式。
- 应用菜单“视图 → 舞台”同步改为子菜单；自由舞台保留 `Ctrl+Shift+S` 快捷键。
- 自由舞台控制栏新增“进入小剧场”，小剧场控制栏新增“返回自由舞台”，不再需要手敲深链。
- 舞台性能下拉文案改为“全渲染（高性能）”与“省电档（仅发言者）”，不再限定 Live2D。

## 3. 内部改动

- 能力 effect：`packages/core/src/capabilities/effects/index.ts` 新增 `CapabilityEffectHandler`、内置 handler 表与 `registerCapabilityEffectHandler`；enable/disable/uninstall 统一查表，内置 kind 拒绝覆盖。
- provider：`packages/ai/src/registry.ts` 新增 `ProviderFactory`、内置协议表与 `registerProviderFactory`；`createProvider` 只负责查表与抛 `ProviderError.unsupported`。
- 动效快照：新增 `apps/web/src/features/avatar/animation/content/index.ts`，导出 `MotionContent` 与 `DEFAULT_MOTION_CONTENT`；运行时构造参数默认引用内置静态表。
- 剧本白名单：`script/validation/registry.ts` 新增 `createScriptPrimitives(content)`，`SCRIPT_PRIMITIVES` 由默认快照派生；字段与内容保持不变。
- 舞台默认形象：`mock-cast.ts`、协作 `stage-adapter.ts` 的 `ROLE_AVATARS`、会议 `meeting-stage-adapter.ts` 的默认表统一改为 `vrm:builtin:*`；会议在未传 fallback 时按槽位分配。
- 舞台入口：桌面 `StageOpenTarget` 增加 `theater` / `free`；`buildStageUrl` 支持 `?stage=play`；托盘、应用菜单、舞台桥与 IPC 白名单同步扩展。
- 舞台切换：控制栏新增模式切换按钮，走整页导航重置 cast/剧本/音频状态，避免两套控制器混跑。

## 4. 门禁结果

- core 能力包相关：9 个测试文件 57 项通过。
- ai registry：5 项通过（OpenAI / Ollama / 未知协议 / 新协议注册 / 重复注册拒绝）。
- web 动效与剧本校验：34 个测试文件 215 项通过；`golden.test.ts` 16 项快照零差异。
- web 舞台：12 个测试文件 65 项通过。
- desktop 托盘与舞台窗：4 个测试文件 20 项通过。
- `pnpm check`：typecheck、lint（仅存量 warning）、行数、结构、循环依赖、ASCII 全部通过。
- 行数：`vrm.ts` 297 行、`effects/index.ts` 164 行、`ai/registry.ts` 30 行、`script/validation/registry.ts` 88 行。
- 迁移：无新增迁移，`LATEST_SCHEMA_VERSION = 51`；备份 schema 不变。

## 5. 已知限制

- 本版只留注册口，不包含 `motion-pack` / `scene-pack` 的安装 schema、签名与 effect。
- provider 注册表只解决“找得到适配器”，不包含协议能力元数据（chat / embedding / vision / tools）。
- `MotionContent` 注入点只在 `VrmAnimationRuntime` 构造参数；`VrmPoseLayer` / `VrmSession` 尚未上抛，等接入内容包时再透传。
- `POSE_EXECUTORS` 仍是适配层静态注册，内容包只能引用已注册执行器或通用骨骼姿势。
- 舞台自由/小剧场切换走整页重载，会重新加载 VRM；后续做状态机后再消除重载。
- 未生成 v3.1 安装包；本地验证需自行构建。

## 6. 发布物料清单

| 物料 | 状态 | 要点 / 大纲 |
|---|---|---|
| 发布说明（本文） | 完成 | 交付、变更、门禁、限制 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | 10 篇归档至 `blog/v3.1/`：总览、能力 handler、provider、动效快照、舞台默认 VRM、舞台入口、边界门禁、测试策略、迁移与兼容、复盘 |
| 安装包 | 未生成 | 需要时再跑 `pnpm release:win` |
| 更新公告 / 截图 | 待补 | 自由舞台与小剧场双向切换截图 |
