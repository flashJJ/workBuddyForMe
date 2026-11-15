# v4.0 进度与决策留痕

> 用途：记录 v4.0 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v4.0 方案](./README.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案落盘，候选 09 移入 scheduled） | 2026-11-15 |
| M1 依赖拓扑 | ✅ 完成（coreVersion、环检测、依赖顺序、健康报告） | 2026-11-15 |
| M2 动效契约抽包 | ✅ 完成（`@wbfm/motion`：契约、内容、默认快照） | 2026-11-15 |
| M3 motion-pack | 待开始 | — |
| M4 内容刷新 | 待开始 | — |
| M5 发布校验 | 待开始 | — |
| M6 收尾 | 待开始 | — |

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

