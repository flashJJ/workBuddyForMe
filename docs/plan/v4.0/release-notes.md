# WorkBuddyForMe v4.0.0 发布说明

> 版本：4.0.0（2026-11-15）
> 主题：平台化一期——依赖拓扑、内容包与发布校验
> 范围：M0 方案与归档 → M1 依赖拓扑 → M2 动效契约抽包 → M3 `motion-pack` → M4 内容刷新 → M5 发布校验 → M6 收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51` 与备份 schema 均不变。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v4.0 方案落盘；候选 09 移入 `docs/roadmap/scheduled/` 并更新三处索引 |
| M1 | manifest 增加 `coreVersion`；安装/启用/升级统一执行依赖预检；依赖序稳定拓扑排序；健康报告覆盖缺失、禁用、版本不匹配与环 |
| M2 | 新增内部包 `@wbfm/motion`：动效契约、姿势/动作/行为注册表、`MotionContent` 与默认快照；web 保留兼容入口 |
| M3 | 新能力类型 `motion-pack`、权限 `motion:pack`、entry `payload/motion-pack.json`、zod payload 校验、effect 与样例包 |
| M4 | 聚合已启用内容包为会话快照；新增 `GET /api/motion-content`；桌宠/主窗/舞台在下次挂载时读取新快照 |
| M5 | 归档产物生成 `SHA256SUMS.txt` 与 `build-info.json`；新增 `release:manifest` / `release:verify` |
| M6 | 全量测试与门禁；发布说明、版本总结与 10 篇技术博客 |

## 2. 用户可见变化

- 能力中心新增 `motion-pack` 类型：导入符合规范的 ZIP 后，可安装一组姿势、动作与分层行为。
- 启用内容包后无需重启应用：下一次打开桌宠、主窗形象栏或舞台时使用新内容；当前会话保持旧快照。
- 停用或卸载内容包后，下一次挂载自动回到内置内容。
- 发布归档目录新增 `SHA256SUMS.txt` 与 `build-info.json`，可用一条命令复核安装包完整性。

## 3. 内部改动

- 依赖拓扑：`packages/core/src/capabilities/deps/index.ts` 提供 `findDependencyCycle`、`dependencyOrder`、`assertCoreVersion` 与 `dependencyIssues`；`assertDependencies` 由安装、启用、升级三处共用。
- 能力 schema：`packages/shared/src/schemas/capability/capability.ts` 增加 `coreVersion`、`motion-pack` kind、`motion:pack` 权限与固定 entry。
- 动效包：`packages/motion/` 使用多入口构建，暴露 `/contracts`、`/poses`、`/motions`、`/behaviors`、`/content`、`/pack`；不依赖 three.js / PIXI。
- 内容包：`packages/core/src/capabilities/effects/motion-pack.ts` 解析 payload、检查类型内重复 id 与内置冲突；停用/卸载无需补偿清理。
- 内容聚合：`packages/core/src/services/media/motion-content-service.ts` 以默认内容打底，合并已启用包，快照版本由排序后的 `id@version` 生成。
- 运行时：`useMotionContent` 在挂载时拉取快照；`VrmCanvas` 等内容就绪后创建 session，快照经 session → controller → pose layer 透传到 `VrmAnimationRuntime`。
- 发布校验：`scripts/release-manifest.mjs` 流式计算 SHA256，写入 coreutils 风格校验和与构建信息；`archive-installer.ps1` 归档后自动调用。

## 4. 门禁结果

- 全量测试：9 个包 717 个测试文件 4108 项通过。
  - core 265 文件 1637 项；web 273 文件 1398 项；database 75 文件 283 项；desktop 33 文件 218 项。
  - shared 41 文件 385 项；ai 16 文件 86 项；voice 9 文件 85 项；config 4 文件 14 项；motion 1 文件 2 项。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII 全部通过。
- 行数：`motion-content-service.ts` 80 行、`effects/motion-pack.ts` 68 行、`pack.ts` 152 行；`vrm-controller.ts` 与 `vrm-pose-layer.ts` 均为 300 行。
- 迁移：无新增迁移，`LATEST_SCHEMA_VERSION = 51`；备份 schema 不变。
- 发布校验：临时目录生成清单后复核通过；篡改文件后同时报出校验和与 build-info 不一致。

## 5. 已知限制

- `motion-pack` 只接受姿势/动作/行为数据，不包含 VRMA 文件与纹理；动作仍引用已注册执行器或通用骨骼姿势。
- 内容刷新是会话级快照，不做运行时热替换；安装/停用后需要重新打开对应入口。
- 发布只做校验和与构建信息，不做 Windows 代码签名、自有更新源与 beta 通道。
- 场景包、道具包、provider 能力元数据与陪伴质量基线不在本版范围。
- 未生成 v4.0 安装包；需要时执行 `pnpm release:win`，归档后按 §6 复核。

## 6. 发布物料清单

| 物料 | 状态 | 要点 / 大纲 |
|---|---|---|
| 发布说明（本文） | 完成 | 交付、变化、门禁、限制、复核方式 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | 10 篇归档至 `blog/v4.0/`：总览、依赖拓扑、coreVersion、动效包、payload 契约、能力管道复用、内容快照、渲染透传、发布校验、复盘 |
| 安装包 | 未生成 | `pnpm release:win`；归档目录含 exe / blockmap / latest.yml / SHA256SUMS.txt / build-info.json |
| 校验和复核 | 可用 | `node scripts/release-manifest.mjs --check --dir <归档目录>` |
| 更新公告 / 截图 | 待补 | 内容包安装与快照刷新截图 |
