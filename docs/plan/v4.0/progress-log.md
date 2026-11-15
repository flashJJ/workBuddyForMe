# v4.0 进度与决策留痕

> 用途：记录 v4.0 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v4.0 方案](./README.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案落盘，候选 09 移入 scheduled） | 2026-11-15 |
| M1 依赖拓扑 | ✅ 完成（coreVersion、环检测、依赖顺序、健康报告） | 2026-11-15 |
| M2 动效契约抽包 | ✅ 完成（`@wbfm/motion`：契约、内容、默认快照） | 2026-11-15 |
| M3 motion-pack | ✅ 完成（kind、payload schema、effect、样例包） | 2026-11-15 |
| M4 内容刷新 | ✅ 完成（内容聚合、快照版本、选择入口与剧本白名单） | 2026-11-15 |
| M5 发布校验 | ✅ 完成（`release-manifest.mjs`、归档接入、复核命令） | 2026-11-15 |
| M6 收尾 | ✅ 完成（全量测试、门禁、发布说明、版本总结、10 篇博客） | 2026-11-15 |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-15 | 依赖仍按能力包 id 表达，不引入服务标识依赖 | 同一条边保留一种解析方式，避免安装期出现两套依赖图 | 若未来出现跨包服务发现，再单独设计 |
| D2 | 2026-11-15 | `coreVersion` 解释为最低应用版本 | 语义单一、可直接比较；范围表达式留到有真实多版本需求时再加 | 需要兼容旧版应用时复核 |
| D3 | 2026-11-15 | 环检测在安装、启用、升级三处执行；健康报告增加 `dependency_cycle` | 三条入口都可能引入环，只在安装处检查会漏升级 | 无 |
| D4 | 2026-11-15 | 不自动批量启用依赖，只输出依赖优先顺序 | 启用是用户显式动作，自动启用会改变现有权限与副作用 | 若做“一键启用依赖链”再改 |
| D5 | 2026-11-15 | v4.0 先做依赖拓扑与内容包，代码签名/自有更新源留到 v4.1 | 证书与 feed 是发布基础设施，独立于平台化主链路 | v4.0 发布后复核 |

## 工作日志

### 2026-11-15 M0 方案与归档

- 新增 `docs/plan/v4.0/README.md`：P0 依赖拓扑 / motion 内部包 / motion-pack / 内容刷新，P1 发布校验，P2 场景包与质量基线。
- `git mv` 候选 09 到 `docs/roadmap/scheduled/v4.0-09-release-trust-and-update.md`，状态改为“只落地方案 A”。
- 更新 candidates / scheduled / roadmap 三处索引，新增 v4.0 进行中区块与序列行。
- 结果：v4.0 范围与非目标可追溯，09 不再重复登记。

### 2026-11-15 M1 依赖拓扑

- 新增 `packages/core/src/capabilities/deps/index.ts`：
  - `findDependencyCycle`：DFS 检环，返回首尾相同的环路径；
  - `dependencyOrder`：Kahn 拓扑排序，同层按 id 排序，结果稳定；
  - `assertCoreVersion`：`coreVersion` 作为最低应用版本；
  - `dependencyIssues`：健康报告覆盖缺失、禁用、版本不匹配与环。
- `capabilityManifestSchema` 增加可选 `coreVersion`；健康问题码增加 `dependency_cycle`。
- `assertDependencies` 统一执行 coreVersion 与环检测；安装、启用、升级三处共用。
- 健康扫描把依赖检查移到 deps 模块，并按整张已安装图计算一次环。
- 测试：deps 4 项、能力包 10 文件 63 项通过；typecheck、行数、结构、循环门禁通过。
- 结果：缺依赖、禁用、版本不匹配与环均在安装/启用/升级前拒绝；现有六类能力行为零回归。
- 下一步：M2 动效契约抽包（`packages/motion`），为 motion-pack 冻结类型与默认内容。

### 2026-11-15 M2 动效契约抽包

- 新增内部包 `@wbfm/motion`：
  - `src/contracts.ts`：姿势/动作/行为/轨道等纯类型；
  - `src/poses/`、`src/motions/`、`src/behaviors/`：内容数据与注册表；
  - `src/content.ts`：`MotionContent` 与 `DEFAULT_MOTION_CONTENT`；
  - 子路径导出：`/contracts`、`/poses`、`/motions`、`/behaviors`、`/content`。
- web 侧保留 `animation/contracts.ts`、`poses/index.ts`、`motions/index.ts`、`behaviors/index.ts`、`content/index.ts` 兼容入口，全部 re-export 包；
- 两个深引用改走 `@wbfm/motion/poses`；web 依赖与 `transpilePackages` 增加 `@wbfm/motion`；
- 包内新增默认内容测试：快照同源、三张注册表非空且 id 唯一。
- 验证：motion 包 2 项、web 动效与剧本校验 34 文件 215 项通过；`golden.test.ts` 16 项零差异；web typecheck 通过。
- 结果：动效内容与渲染适配解耦，包不依赖 three.js/PIXI；`animation/` 直接文件仍为 12 个。
- 下一步：M3 `motion-pack` 能力类型与 effect。

### 2026-11-15 M3 motion-pack

- 能力类型：`CAPABILITY_KINDS` 增加 `motion-pack`，权限 `motion:pack`，entry 固定 `payload/motion-pack.json`，纳入支持列表与 payload 体积上限（256 KB）。
- payload schema：`@wbfm/motion/pack` 用 zod 校验姿势/动作/行为、轨道、表情与视线枚举；空内容拒绝。
- effect：`enableMotionPack` 解析 payload、检查类型内重复 id 与内置内容冲突，返回 manifest.id；停用/卸载无需额外清理。
- 示例包：新增 `com.example.sample.motion-pack`，含一个右臂姿势；能力目录与服务示例可下载。
- 测试：payload 合法/非法、重复、内置冲突 2 项；安装→停用→再启用→卸载生命周期 1 项；注册表 4 项。
- 结果：motion-pack 复用现有 ZIP/校验和/签名/升级/回滚链路，不新增数据库表。
- 下一步：M4 聚合启用内容并刷新运行时快照。

### 2026-11-15 M4 内容刷新

- 新增 `packages/core/src/services/media/motion-content-service.ts`：
  - `mergeMotionContent`：默认内容打底，按已启用 `motion-pack` 顺序合并 poses/motions/behaviors；同类型重复 id 拒绝；`version` 为 `packs:<sha256 前 12 位>`，排序后计算保证稳定；
  - `createMotionContentService`：读取已启用能力行，按包目录解析 payload，实时聚合；无内容包时返回默认快照同一引用。
- 新增 `GET /api/motion-content`（nodejs 运行时、强制动态），返回当前快照。
- 新增 `useMotionContent`：挂载时拉取一次，3 秒超时回落默认内容；返回 `ready` 供会话初始化等待。
- `VrmCanvas` 等待内容就绪后创建 `VrmSession`，并把快照经 session → controller → pose layer 透传到 `VrmAnimationRuntime`；场景坐标不变。
- 测试：聚合服务 3 项（默认同引用、启用/停用合并、跨包冲突）；web VRM/动效 48 文件 273 项通过。
- 门禁：`vrm-controller.ts` 与 `vrm-pose-layer.ts` 压至 300 行内；`pnpm check` 全绿。
- 结果：安装/停用 `motion-pack` 后不重启应用，下一次打开舞台/桌宠即使用新快照；当前会话保持旧快照，不热替换。
- 下一步：M5 发布校验（`SHA256SUMS` 与 `build-info.json`）。

### 2026-11-15 M5 发布校验

- 新增 `scripts/release-manifest.mjs`：
  - 扫描归档目录产物，流式计算 SHA256，生成 coreutils 风格 `SHA256SUMS.txt`；
  - 生成 `build-info.json`：版本、commit、分支、构建时间（取产物最新 mtime）、生成时间、平台、架构与逐文件大小/哈希；
  - `--check` 复算全部哈希，并核对 `build-info.json` 的版本与文件哈希；缺失、篡改、版本漂移均 exit 1。
- `scripts/archive-installer.ps1` 归档后改为调用该脚本，一次生成校验和与构建信息；失败即中止归档。
- 根 `package.json` 增加 `release:manifest` 与 `release:verify`；`release:win` 自动获得校验清单。
- 验证：临时目录生成→复核通过；篡改 `latest.yml` 后复核失败并同时报出校验和与 build-info 两处不一致。
- 文档：v4.0 方案新增 §5.5，固定归档五件套、复核命令与发布说明引用字段。
- 结果：安装包、blockmap 与 `latest.yml` 可复算校验和，构建信息可回溯到 commit 与构建时间；不涉及代码签名与更新源。
- 下一步：M6 收尾（测试、门禁、发布说明、版本总结与博客）。

### 2026-11-15 M6 收尾

- 全量测试：9 个包 717 个测试文件 4108 项通过（core 1637、web 1398、shared 385、database 283、desktop 218、ai 86、voice 85、config 14、motion 2）。
- 修复两处存量测试环境缺口：设置页挂载测试未包 `MusicProvider`，在 `app-shell.test.tsx` 与 `en-coverage.test.tsx` 中按真实布局补齐；业务代码未改。
- 版本号升至 `4.0.0`，`pnpm sync-version` 同步 web / desktop / shared 运行时版本。
- 新增 `release-notes.md` 与 `version-summary.md`：交付、用户可见变化、内部改动、门禁、限制与下一版本衔接。
- 新增 `blog/v4.0/` 10 篇：总览、依赖拓扑、coreVersion、动效包、payload 契约、能力管道复用、会话快照、渲染透传、发布校验、复盘。
- 更新根 README、roadmap 索引、scheduled 状态与 blog 索引。
- `pnpm check` 全绿；安装包未生成，合入 main、tag、更新公告与截图待补。
- 口径修正：v4.0 README 去掉 `motion-pack` “可选 VRMA”的表述；VRMA 动作继续由 `pet-action` 承载，`motion-pack` 只合并程序化 JSON。
- 下一步：发布收尾（合入 main、打 tag、生成安装包与公告）。

### 2026-11-15 M4 补链：内容包动效选择入口与剧本白名单

- 剧本白名单：`createScriptPrimitiveSets`、`validateScene` 与 `parseGeneratedScene` 接受 `MotionContent`；生成提示词与生成场景校验使用服务端内容快照；客户端 `useScriptDirector` 跟随 `useMotionContent`。
- 运行时：新增 `VrmPreviewPose` 与 `VrmController.playPose`；行为/动作开始时清除姿势预览，避免叠加冲突。
- 入口：新增共用 `MotionContentMenu`；自由舞台按聚焦角色选择行为/动作/姿势，桌宠直接在当前控制器上播放。
- 测试：新增白名单、集合视图、选择菜单、姿势预览与失败回落 7 项；avatar/stage/pet 113 文件 665 项；全量 9 包 719 文件 4115 项；`pnpm check` 全绿。
- 结果：安装内容包后，舞台/桌宠可选择并预览内容包条目，生成剧本可引用已启用内容，对应验收 §6.4 补齐。
- 下一步：发布收尾（合入 main、打 tag、生成安装包与公告）。


