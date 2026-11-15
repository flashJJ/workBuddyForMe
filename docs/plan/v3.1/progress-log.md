# v3.1 进度与决策留痕

> 用途：记录 v3.1 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v3.1 方案](./README.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案落盘，候选 05/06 移入 scheduled） | 2026-11-15 |
| M1 能力 handler 注册表 | ✅ 完成（六类零回归，新 kind 可注册） | 2026-11-15 |
| M2 provider 注册表 | ✅ 完成（内置协议零回归，新协议可注册） | 2026-11-15 |
| M3 动效内容快照 | ✅ 完成（默认 golden 零差异，注入快照可播放） | 2026-11-15 |
| M4 门禁与收尾 | ✅ 完成（`pnpm check` 全绿；已合入 main 并推送工蜂） | 2026-11-15 |
| 发布收尾 | ✅ v3.1.0（版本号、发布说明、版本总结、10 篇博客） | 2026-11-15 |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-15 | v3.1 只做候选 05 的 S1/S3 与候选 06 的方案 A，不做 `motion-pack` 安装与新 kind schema | 小步验证「不改内核加能力」，避免把内容包安装、签名与回滚一起拉进本版 | v4.0 立项时复核内容包边界 |
| D2 | 2026-11-15 | `MotionContent` 放 `animation/content/index.ts` 子目录 | `animation/` 直接文件已达 12 个预算上限，新增文件会触发结构门禁 | 后续抽包时再评估目录层级 |
| D3 | 2026-11-15 | 本版注入点只做到 `VrmAnimationRuntime` 构造参数，不改 `VrmPoseLayer` / `VrmSession` 调用链 | 当前没有真实内容包来源，继续上抛只会增加无调用方的管道参数 | 接入 `motion-pack` 时再把快照从会话层传入 |
| D4 | 2026-11-15 | 能力 kind 与 provider 协议的注册函数都拒绝覆盖内置项 | 避免运行期隐式替换导致行为不可追踪；新增项必须显式命名 | 若 v4.0 需要覆盖，另加显式 `replace` 语义 |

## 工作日志

### 2026-11-15 M0 方案与归档

- 新增 `docs/plan/v3.1/README.md`：目标、Non-Goals、M0–M4、验收口径与风险。
- `git mv` 候选 05/06 到 `docs/roadmap/scheduled/v3.1-05-plugin-architecture.md`、`v3.1-06-motion-library-package.md`，并更新 candidates/scheduled/roadmap 三处索引与 v3.0 文档中的两处旧链接。
- 结果：候选表不再重复登记，v3.1 来源方案可追溯。

### 2026-11-15 M1 能力 handler 注册表

- `packages/core/src/capabilities/effects/index.ts`：六类 effect 改为 `CapabilityEffectHandler` 表；enable 未注册抛 `ApiError.validation`，disable 静默，uninstall 走可选 handler。
- 新增 `effects/registry.test.ts`：新 kind 注册后可 enable/disable/uninstall；未注册 kind 的三种行为；拒绝覆盖内置项；空句柄卸载无操作。
- 结果：`packages/core` capabilities 目录 57 项测试通过，现有六类安装/启停/升级测试零改动。

### 2026-11-15 M2 provider 注册表

- `packages/ai/src/registry.ts`：协议分发改为 `Map<string, ProviderFactory>`，新增 `registerProviderFactory`；未知协议仍抛 `ProviderError.unsupported`。
- `packages/ai/src/index.ts` 导出注册函数与工厂类型。
- `registry.test.ts` 新增 mock 协议接入与重复注册拒绝；现有 OpenAI/Ollama/未知协议断言保留。
- 结果：`@wbfm/ai` registry 5 项测试通过。

### 2026-11-15 M3 动效内容快照

- 新增 `animation/content/index.ts`：`MotionContent` 与 `DEFAULT_MOTION_CONTENT`（直接引用 `POSES / MOTIONS / BEHAVIORS`）。
- `VrmAnimationRuntime` 构造参数接受 `MotionContent`，默认内置内容；`animation/index.ts` 导出类型与默认快照。
- `script/validation/registry.ts`：新增 `createScriptPrimitives(content)`，`SCRIPT_PRIMITIVES` 由默认快照派生，字段与内容不变。
- 新增 `__tests__/content/content.test.ts`：默认快照同源；注入单姿势后运行时只看到注入内容并可写骨骼。
- 结果：web 动效与剧本校验 34 个测试文件、215 项测试通过；`golden.test.ts` 16 项快照零差异。

### 2026-11-15 M4 门禁与收尾

- `pnpm check` 通过：typecheck、lint（仅存量 warning）、行数、结构、循环依赖、ASCII 文档检查。
- 行数：`vrm.ts` 297 行、`effects/index.ts` 164 行、`registry.ts`（ai）30 行、`script/validation/registry.ts` 88 行，均低于 300 行硬门禁。
- 结构：新增测试首次放在 `animation/__tests__` 根下触发 13 > 12，改为 `__tests__/content/` 子目录后通过。
- 合入：merge commit `d97024a1` 已推送到 `tencent/main`；未推 GitHub。
- 遗留：安装包未生成，更新公告与截图待补。

### 2026-11-15 发布收尾

- 版本号升至 3.1.0，`pnpm sync-version` 同步 web / desktop / shared 运行时版本。
- 新增 `release-notes.md` 与 `version-summary.md`：交付、用户可见变化、内部改动、门禁、限制与下一版本衔接。
- 新增 `blog/v3.1/` 10 篇：注册表总览、能力 handler、provider factory、动效快照、golden 测试、舞台默认 VRM、舞台入口、结构门禁、零迁移兼容、复盘。
- 更新根 README、roadmap 索引、scheduled 状态、blog 索引与本页状态。
- `pnpm check` 全绿；安装包未生成，更新公告与截图待补。
