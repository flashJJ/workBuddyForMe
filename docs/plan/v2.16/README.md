# v2.16 方案：可导航——目录按能力收拢、入口统一、页面少拼装

> 状态：✅ M0 已冻结（2026-11-01，见 [01-M0-契约冻结](01-M0-契约冻结.md) / [02-M0-评审记录](02-M0-评审记录.md)）；进入 M1 包层收拢 A
> 上一正式版：v2.15.0（可运营：快照清理、审计锚点、凭证轮换、版本对比）
> 主题一句话：**不改功能，只改「找代码、改代码、加代码」的成本：目录一眼能看懂，能力有统一入口，页面不再把十几个接口拼在一起。**

## 1. 版本主题与目标

v2.15 把日常运维动作补齐后，代码本身的结构成本开始成为迭代速度的上限：

- 24 个目录直接文件 ≥20 个，最大 84 个；新文件往哪放靠记忆；
- 31 个 web feature 只有 1 个公开入口，跨域引用直接落到具体文件；
- 91 条跨 feature 深引用，改一个文件名就可能牵动多个域；
- 设置页一次挂载约 35 个面板，每个面板独立取数，首屏请求扇出没有量化；
- 行数门禁只管单文件 ≤300 行，不管目录是否已经变成「文件堆」。

v2.16 不加新能力面，只做四件结构性收口：

1. **目录可导航**：大目录按子能力分区，每个目录有明确的职责与文件预算；
2. **入口统一**：每个 feature / 域目录暴露一个纯 re-export 的 `index.ts`，外部按能力引用，不再按文件名引用；
3. **页面少拼装**：页面级数据 facade + 可见区懒挂载；仅在测量证明必要时，才增加只读聚合端点；
4. **规则可执行**：目录预算、跨域边界、循环依赖与新文件落点，全部写进脚本 / ESLint / 架构文档。

### 1.1 成功指标（可验收）

| 指标 | 基线（v2.15.0） | 目标（v2.16.0） |
|---|---|---|
| 直接文件 ≥20 的目录（排除迁移） | 24 | ≤10 |
| P0 目录直接文件数 | 12 个目录 23–84 | 每个 ≤12（子目录内同样 ≤12） |
| web feature 公开入口 | 1 / 31 | 多文件 feature 100%；单文件 feature 豁免登记 |
| 跨 feature 深引用 | 91 | 0（允许矩阵内例外 ≤10，逐条登记） |
| `@/features/*` 深路径导入行 | 101 | ≤20（全部落在允许例外） |
| 模块循环依赖 | 未测（M0 建立基线） | 0 新增；存量逐域清零 |
| 设置页首屏 distinct GET | M0 用 Playwright 测量 | 比基线下降 ≥50%，或聚合端点准入被否决 |
| 首屏 First Load JS | 设置页 457 kB / 工作流详情 386 kB | 各页面增长 ≤5% |
| 行为回归 | 单测 2879 / Web e2e 139 / 桌面 10/11 | 不降级 |
| 迁移 | v042 | 零迁移，`LATEST_SCHEMA_VERSION = 42` |

> 「减少接口调用频率」不靠拍脑袋合并接口：React Query 已对相同 key 去重，先测 distinct GET、瀑布层数与 payload，再决定用懒挂载、facade 还是只读聚合端点。

## 2. 现状与缺口

> 详细数据与目录清单见 [00-现状取证](00-现状取证.md)。

| 面 | 现状 | 缺口 |
|---|---|---|
| 包层目录 | `@wbfm/core` 已有约 35 个域子路径；`@wbfm/shared` 有约 16 个 | `shared/schemas` 84 个、`database/repositories` 70 个文件平铺 |
| core 目录 | 域 barrel 已存在，但 services / agents / chat / flow 仍有 35–53 个直接文件 | 子能力未分区，runner / protocol / tools 混放 |
| web feature | 只有 `agent-collab` 有 `index.ts` | 外部必须知道内部文件名；目录调整牵动调用点 |
| 跨域引用 | 91 条跨 feature 深引用 | 没有依赖矩阵，合理耦合与偶然耦合无法区分 |
| 目录门禁 | 只有单文件 300 行门禁 | 没有目录文件预算，胖目录会继续变胖 |
| 循环依赖 | 未检查 | barrel 引入后风险上升 |
| 页面数据 | 设置页约 35 个面板各自取数 | 首屏请求扇出未量化；无页面 facade |
| 架构文档 | 散落在开发文档与代码注释 | 没有「新增文件放哪里」的统一决策树 |

## 3. 设计规则（M0 冻结）

### 3.1 目录分类法

- **域 > 子能力 > 文件**：每个 feature / 包域先按业务能力分二级目录，文件只放最具体的子目录。
- **直接文件预算**：P0 目录直接 `.ts/.tsx` ≤12；子目录同样 ≤12；超出必须继续分区或说明豁免。
- **职责后缀**：统一使用 `*-service.ts`、`*-repo.ts`、`*-schema.ts`、`use-*.ts`、`*-panel.tsx`、`*-dialog.tsx`、`*-helpers.ts`；停止新增 `*-kernel.ts`、`*-utils.ts` 这类无法判断职责的后缀。
- **测试跟随实现**：测试与实现同目录；移动文件时测试一起移动，断言零改动。
- **豁免**：`packages/database/src/migrations`（append-only 历史）、生成清单、i18n 词条字典；豁免必须在结构脚本中登记原因。

### 3.2 公开入口

- 每个 feature / 包域提供 `index.ts`，只做纯 re-export，不写运行逻辑、不产生副作用。
- **外部按能力引用**：`@/features/settings`、`@/lib/hooks/chat`；**内部直接引用文件**，禁止从自己目录的 barrel 反向导入（防循环）。
- 入口只导出跨域确实需要的能力；内部组件、内部 hook、测试夹具不导出。
- 根 barrel 超过 300 行时，按子域拆成 `agent/index.ts` 等二级 barrel，根入口只 re-export 二级 barrel。
- 客户端与服务端入口分离：`lib/server` 不进客户端 feature barrel；服务端专用模块不得被 `'use client'` 组件间接拉入。

### 3.3 依赖方向与跨域矩阵

- 纵向：`shared → database/core → web feature → app route`，沿用现有包方向门禁。
- 横向：web feature 之间建立允许矩阵。合理能力依赖保留，例如：
  - `chat → events`（工具事件驱动的剧情/特效）；
  - `avatar → events`（表情与剧情联动）；
  - `stage → avatar`（舞台角色渲染）；
  - `pet → avatar`（桌宠复用形象渲染）；
  - `settings → events/voice/memory/...`（设置页聚合各域面板）。
- 矩阵外的跨域引用一律改走公开入口或上移到共享层；允许例外必须写进 `docs/architecture.md` 并登记原因与到期版本。
- 禁止通过「复制一份」绕开依赖矩阵；共享能力上移到 `lib/` 或 core 域。

### 3.4 页面组合查询（BFF 思路的收敛版）

按代价从低到高，依次评估，不默认新增聚合端点：

1. **页面级 facade hook**：把一个页面需要的查询组合成单一 hook（内部仍可并行多个 query），统一 loading / error / 失效策略，页面只依赖 facade。
2. **可见区懒挂载**：设置页按 4 个分组 + 基础区懒挂载，非当前分组不挂载、不发请求；锚点跳转时再挂载。
3. **只读聚合端点**：仅当首屏仍有 ≥4 个独立资源、且 facade/懒挂载后仍高于目标时启用。要求：
   - 只读，不聚合 mutation；
   - 服务端复用既有 service / repo，不复制 SQL；
   - 响应 schema 放 shared，字段按页面最小集；
   - 现有端点保留，旧页面零影响；
   - 明确失效矩阵：哪些 mutation 失效聚合 key，哪些只需失效明细 key；
   - payload ≤ 原请求总和 +10%，p95 不劣化。

### 3.5 可读性工具

- `scripts/check-structure.mjs`：目录直接文件预算 + 公开入口存在性 + 豁免清单，接入 `pnpm check`（先 warn 一个版本，再 error）。
- ESLint 增补 `import/no-restricted-paths`：禁止 `@/features/<A>/...` 深引用其他 feature 内部；禁止 `features/**` 引用 `lib/server/**`。
- 循环依赖：M0 建立基线；优先用 `import/no-cycle` 或独立脚本，禁止新增循环，存量按域清零。
- `docs/architecture.md`：目录地图、依赖矩阵、公开入口规则、新增文件决策树、豁免清单。
- 新功能检查清单：落点、入口导出、跨域依赖、测试位置、目录预算五项。
- 一次性 import codemod：移动文件后批量改写引用，先 `--dry-run` 再写回；移动提交只做 `git mv` + 引用改写，行为零改动。

## 4. 目标目录与拆分建议

| 层 | 目录 | 现直接文件 | 建议分区 | 里程碑 |
|---|---|---:|---|---|
| shared | `shared/src/schemas` | 84 | `agent/` `chat/` `knowledge/` `flow/` `capability/` `ops/` `media/` | M1 |
| database | `database/src/repositories` | 70 | `agent/` `chat/` `knowledge/` `workflow/` `capability/` `ops/` `settings/` `media/` | M1 |
| core | `core/src/services` | 53 | `provider/` `assistant/` `knowledge/` `settings/` `task/` `media/` `ops/` | M2 |
| core | `core/src/agents` | 53 | `runner/` `protocol/` `subagent/` `stage/` | M2 |
| core | `core/src/chat` | 46 | `orchestrator/` `context/` `tools/` `turns/` `persona/` | M2 |
| core | `core/src/flow` | 35 | `compiler/` `engine/` `run/` `handlers/` `versioning/` | M2 |
| web | `features/settings` | 55 | `appearance/` `dialog/` `tools/` `data/` `providers/` `about/` | M3 |
| web | `features/chat` | 46 | `components/` `hooks/` `markdown/` `session/` | M3 |
| web | `features/events` | 40 | `player/` `triggers/` `fx/` `hooks/` | M3 |
| web | `features/avatar` | 36 | `live2d/` `vrm/` `expression/` `reunion/` `motion/` | M3 |
| web | `features/flow-editor` | 23 | `canvas/` `panels/` `endpoint/` `versions/` | M3 |
| web | `lib/hooks` | 26 | `chat/` `flows/` `knowledge/` `settings/` `ops/` | M3 |
| web | `lib/server` | 22 | `container/` `routes/` `sse/` `scheduler/` `wiring/` | M3（P1，可延后） |

> 其余目录（`core/backup`、`core/knowledge`、`core/tools`、`core/emotion`、`features/voice`、`features/stage`、`features/pet`、`shared/constants`、i18n 词条）列为 P1 候补，不阻塞 v2.16 出口；若 M1-M3 提前完成可顺延处理。

## 5. 架构影响

| 层 | 改动 |
|---|---|
| `packages/shared` | 文件移动 + 二级 barrel；根 `schemas` 导出面不变；无 schema 变更 |
| `packages/database` | 仓储文件移动；根入口不变；可评估新增域子路径导出（非必须） |
| `packages/core` | services / agents / chat / flow 分区；既有子路径导出保持；无服务行为变更 |
| `apps/web` | feature 分区 + `index.ts` 公开入口；页面改为按能力引用；设置页试点页面 facade / 懒挂载 |
| `apps/desktop` | 不动；仅确认构建产物归集不受 web 目录移动影响 |
| 工具链 | 新增结构预算脚本、跨域边界规则、循环检查；不新增运行时依赖 |
| 数据库 | **零迁移**；不改表、列、索引 |

## 6. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 取证与规则冻结 | 补测设置页请求基线、包体、循环；冻结目录分类法、预算、跨域矩阵、聚合端点准入 | 契约与评审记录落盘；基线数字可复核 |
| M1 包层收拢 A | `shared/schemas` + `database/repositories` 分区与二级 barrel；根导出面不变 | 两目录直接文件 ≤12；单测断言零改动；全量单测通过 |
| M2 包层收拢 B | `core/services`、`agents`、`chat`、`flow` 分区；子路径导出保持 | 四目录直接文件 ≤12；core 测试通过；构建通过 |
| M3 Web 域层收拢 | 6 个 web feature + `lib/hooks`（`lib/server` 可选）分区；多文件 feature 建立公开入口 | 多文件 feature 入口 100%；跨 feature 深引用 0；Web e2e 通过 |
| M4 页面组合查询 | 设置页试点：facade + 可见区懒挂载；按数据决定是否加只读聚合端点 | 首屏 distinct GET 降 ≥50% 或聚合端点准入被明确否决；包体增长 ≤5% |
| M5 可读性门禁与回归 | 结构预算脚本、跨域 ESLint、循环检查、架构文档、新功能清单；全量回归 | `pnpm check` 含结构门禁；单测 / 构建 / Web e2e / 桌面冒烟不降级 |
| M6 验收与发布 | 版本 2.16.0、验收文档、发行说明、安装包与 Release | Release 置 Latest |

## 7. 风险与取舍

- **大爆炸式移动**：按目录分批提交，移动提交与行为修改分离；每批只做 `git mv` + 引用改写，review 用 `--find-renames` 看移动。
- **barrel 循环与副作用**：入口只做 `export`/`export type`；内部禁止反向导入自身 barrel；循环检查进 CI。
- **客户端包体膨胀**：web 端按域拆入口，不设单一 `@/features/index.ts` 巨型 barrel；每个里程碑对比 First Load JS。
- **跨域矩阵过严**：合理依赖保留并登记，不为「零引用」制造重复实现；例外到期复核。
- **聚合端点耦合**：只读、最小字段、现有端点保留；若数据不达标，M4 只交付 facade/懒挂载，不硬上聚合。
- **next build 解析变化**：每批移动后跑 `pnpm build:web`，避免开发态可解析、生产构建失败。
- **测试迁移成本**：测试跟随文件移动，只改 import 路径，不断言；移动批次控制大小。
- **行数门禁冲突**：二级 barrel 若超过 300 行，继续按子域拆分；不允许把豁免扩大成常态。

## 8. Non-Goals

- 不改任何功能行为、UI 呈现、API 契约与错误码（可选只读聚合端点除外）。
- 不做数据库迁移、不改表 / 列 / 索引。
- 不拆分 / 发布新的 npm 包，不引入新的状态管理或数据获取框架。
- 不重写测试，不顺手修业务 bug（发现的问题记 backlog）。
- 不改写迁移历史，不合并 / 重排迁移文件。
- 不做自动清理、自动重命名或自动重构平台。
- 不追求「全部目录 ≤12」的一刀切；先 P0，P1 看收益。

## 9. 验收口径

1. P0 目录直接文件 ≤12，子目录同样 ≤12；≥20 文件目录从 24 降到 ≤10。
2. 多文件 web feature 均有公开入口；跨 feature 深引用 0，确需例外时 ≤10 且登记。
3. 页面试点：首屏 distinct GET 比基线降 ≥50%，或聚合端点准入被明确否决；First Load JS 增长 ≤5%。
4. 结构预算、跨域边界、循环检查进入 `pnpm check`；新违例阻断。
5. `docs/architecture.md` 可回答「新增文件放哪里、能否跨域引用、入口导什么」。
6. 单测 2879 / Web e2e 139 / 桌面冒烟 10/11 不降级；零迁移。
7. 版本 2.16.0、安装包 + blockmap + latest.yml、Release 置 Latest。

## 10. 与 backlog 的对应

| 来源 | 处置 |
|---|---|
| 用户反馈：大目录未细分、结构不直观 | P0：M1-M3 目录收拢 |
| 用户反馈：按能力引用、集中注册入口 | P0：M3 feature 公开入口 |
| 用户反馈：类似中台接口整合数据、减少调用频率 | P0：M4 页面 facade / 懒挂载；只读聚合端点按数据准入 |
| 既有 300 行门禁 | 保留；新增目录预算脚本 |
| 既有包方向 / internal 门禁 | 保留；扩展到 web feature 域间 |
| i18n 词条、shared 常量、desktop 主进程大目录 | P1 候补，不阻塞本版 |
| 自动重构平台、架构自动图 | P2，后续版本 |

---

[^1]: 目录与引用基线见 [00-现状取证](00-现状取证.md) 第 2–4 节。
[^2]: 现有包方向与 internal 门禁见仓库根 `.eslintrc.cjs`；web 端见 `apps/web/.eslintrc.json`。
[^3]: 行数门禁与白名单见 `scripts/check-file-lines.mjs`、`scripts/.lines-whitelist.json`。
