# v4.1 Spec：陪伴质量评测与性能预算门禁

> 状态：待评审。关联 [v4.1 方案](./README.md)。
> 口径：只做离线评测与本地门禁；决策链路、数据库 schema、现有设置页行为保持兼容。

## 1. 目标

1. 用同一套打分器离线回放最近决策，并跑 12 组固定上下文矩阵，输出可对比报告。
2. 在设置页提供只读质量卡，展示重复率、去重/弱偏好/未播命中率与门控快照。
3. 把性能采样补齐到 p50/p95、长任务、堆与 GPU 资源计数，提供 4h 归档与 10 分钟相对基线门禁。

## 2. 非目标

- 在线 A/B、聊天正文分析、用户满意度推断。
- 绝对帧率门槛、工蜂 CI 接入、夜间自动长跑。
- 新增运行时拒绝埋点或持久化拒绝日志。
- 资产体积预算（候选 08）、音频导演（候选 10）。

## 3. 现状与依据

| 事实 | 位置 |
|---|---|
| 六个基础维度加权 + 去重/偏好/长场次增减 | `apps/web/src/features/avatar/script/utility/score.ts`（`DECISION_WEIGHTS`、`scoreCandidate`） |
| 候选提取与确定性排序 | 同目录 `select.ts`（`toDecisionCandidate`、`rankCandidates`、`rankSceneCandidates`） |
| 决策记录上限 20、展示 5、理由码白名单 | `packages/shared/src/schemas/script/decision.ts` |
| 决策持久化与标题补齐 | `apps/web/.../generation/decisions/index.ts`、`generation/server.ts` |
| 质量卡挂载点 | `apps/web/src/features/settings/script/script-schedule-panel.tsx`（第 269 行 `<ScriptDecisions />`） |
| 生成队列与 sceneMeta | `apps/web/.../generation/service.ts` 的 `list()` |
| 播放预算形状 | `packages/shared/src/schemas/script/generated.ts` 的 `PetScriptPlaybackSummary` |
| 长跑脚本现状 | `scripts/perf/pet-longrun.mjs`：fps、rAF avg/p95/max、GL clears/draws、堆、DOM |
| GPU 资源计数 | `apps/web/src/features/avatar/vrm/vrm-debug.ts` 的 `resources()` |
| 模型热替换入口 | `apps/web/src/app/pet/page.tsx` 的 `bridge.onModelChange` |
| i18n 文案 | `packages/shared/src/i18n/messages/settings-script.ts` 的 `decisions` 命名空间 |

## 4. 详细设计

### 4.1 M1 打分契约下沉

新增 `packages/shared/src/script/`：

- `types.ts`：原样迁移 `DecisionContext`、`DecisionCandidate`、`RankedCandidate`；新增
  `export type DecisionWeights = typeof DECISION_WEIGHTS;` 放 `score.ts`。
- `score.ts`：迁移 `DECISION_WEIGHTS`、`scoreCandidate` 与内部函数；`MAX_REASONS` 改用
  `PET_SCRIPT_DECISION_LIMITS.maxReasons`。签名改为
  `scoreCandidate(ctx, candidate, weights: DecisionWeights = DECISION_WEIGHTS)`。
- `select.ts`：迁移 `toDecisionCandidate`、`rankCandidates`、`selectBestCandidate`、`rankSceneCandidates`；
  三个排序/选择函数增加可选 `weights` 末参并透传。
- `index.ts`：导出以上全部类型与函数。

修改：

- `packages/shared/package.json`：新增 `"./script"` 子路径，`types`/`development` 指向
  `./src/script/index.ts`，`import`/`require` 指向现有 `dist/index.mjs` / `dist/index.cjs`。
- `packages/shared/src/index.ts`：`export * from './script';`。
- `apps/web/src/features/avatar/script/utility/types.ts`：改为
  `export type { DecisionCandidate, DecisionContext, RankedCandidate } from '@wbfm/shared/script';`。
- 同目录 `score.ts` / `select.ts`：改为 re-export（含 `DecisionWeights`），不保留实现。
- `utility/index.ts` 与 `trigger.ts` 不改。
- `packages/shared/src/schemas/script/decision.ts`：`maxStored: 20` → `50`，其余不变。
- `packages/shared/src/i18n/messages/settings-script.ts`：决策提示补「保留最近 50 条、展示 5 条」（中英各一处）。

测试：

- 新增 `packages/shared/src/script/score.test.ts`：权重默认值、同输入确定性、理由码排序与上限。
- 现有 `apps/web/.../utility/utility.test.ts` 不改并必须通过（验证 shim 零差异）。

### 4.2 M2 评测纯函数

新增 `packages/shared/src/script/eval/`：

- `types.ts`
  - `CompanionEvalContext { id; label; hour; idleMinutes; relationshipLevel; mood; work; recentProps?; recentThemes?; usedTags? }`
  - `CompanionCandidateSnapshot { sceneId; title?; durationMs; beatCount?; props?; playedToday?; lastPlayedAt?; theme?; tags?; preferredMoods?; preferredHours? }`
  - `CompanionMatrixRow { contextId; ranked: { sceneId; score; reasons }[] }`
  - `CompanionRankDiff { contextId; sceneId; fromRank; toRank }`
  - `CompanionReplayRow { at; sceneId; recordedScore; recomputedScore; delta; missing }`
  - `CompanionQualityReport { window; count; repeats; repeatRate; dedupeHits; dedupeRate; freshHits; freshRate; prefHits; prefRate; longSceneHits; avgScore; topReasons; gate }`
- `matrix.ts`
  - `DEFAULT_EVAL_CONTEXTS: readonly CompanionEvalContext[]`（固定 12 组）
  - `toCandidateFromSnapshot(snapshot): DecisionCandidate`
  - `runMatrix(contexts, candidates, weights?): CompanionMatrixRow[]`
  - `diffMatrix(previous, next): CompanionRankDiff[]`（只输出排名变化的项，按 contextId + sceneId 排序）
- `replay.ts`
  - `replayDecisions(records, candidatesById, weights?): { rows; total; replayable; missing; meanAbsDelta; maxAbsDelta }`
  - 增量沿用记录中 `dedupe:*`、`pref:*`、`cost:long-scene` 的 `delta` 之和，基础分按 4.2 口径重算。
- `metrics.ts`
  - `summarizeDecisions(records): CompanionQualityReport`（gate 由调用方补）
  - `attachGate(report, gate): CompanionQualityReport`
  - `QualityGateSnapshot { perDay; playsToday; budgetRemaining; unplayedScenes; quietHoursActive }`

测试：`matrix.test.ts`、`replay.test.ts`、`metrics.test.ts`，覆盖 12 组、确定性、权重换位、缺失候选、重复率与理由 Top 5。

### 4.3 M2 评测脚本

新增 `scripts/eval/companion-report.mjs`：

- 只读打开 SQLite（`createRequire` 从 `packages/database/package.json` 解析 `better-sqlite3`，`{ readonly: true, fileMustExist: true }`）。
- 读取 `settings_kv` 的五个键：`pet-script.decisions`、`pet-script.generation`、`pet-script.journal`、`pet-script.playback`、`pet-script.schedule`。
- 参数：`--db=<path>`（缺省按桌面数据目录解析；找不到时退出 2）、`--out=<path>`（默认 `docs/eval/companion-report.json`）、`--weights=hour=0.2,mood=0.15,...`、`--limit=50`。
- 候选：生成队列 `scenes` + `sceneMeta` → `toDecisionCandidate`；不足 3 条时读 `scripts/eval/companion-fixtures.json` 的 5 条快照。
- 输出：JSON 报告（回放行、矩阵行、与上次报告 `rankDiff`、指标、门控快照）与控制台摘要；基础设施失败退出 2，其余退出 0。
- 新增 `scripts/eval/companion-fixtures.json`：12 组上下文与 5 条候选快照（无聊天内容）。
- 根 `package.json`：`"eval:companion": "pnpm --filter @wbfm/shared build && node scripts/eval/companion-report.mjs"`。

### 4.4 M2 质量 API 与设置卡

新增 `apps/web/src/app/api/pet/script/quality/route.ts`：

- `runtime = 'nodejs'`、`dynamic = 'force-dynamic'`。
- `GET` → `jsonOk(createPetScriptServer(services).quality())`。

修改 `apps/web/src/features/avatar/script/generation/server.ts`：

- `createPetScriptServer` 返回值新增 `quality(limit = PET_SCRIPT_DECISION_LIMITS.maxStored)`。
- 聚合：`decisions.list(limit)`、`generator.list()`（scenes + sceneMeta）、`playback.summary()`、`deps.quietHours?.()`。
- 勿扰判断复用 `./schedule` 现有谓词，不新增规则。
- 调用 shared 的 `summarizeDecisions` / `attachGate`，不复制统计逻辑。

新增 `apps/web/src/features/settings/script/script-quality.tsx`：

- `useVisibleQuery` + `apiGet<CompanionQualityReport>('/api/pet/script/quality')`，失败静默。
- 展示：决策条数/窗口、重复率、去重命中率、弱偏好命中率、未播命中率、预算与勿扰状态、理由 Top 5；空记录占位。
- 挂载：`script-schedule-panel.tsx` 在 `<ScriptDecisions />` 后新增 `<ScriptQuality />`。

i18n：`settings-script.ts` 新增 `quality` 命名空间（中英），复用现有 `reasons` 标签。

测试：`script-quality.test.tsx`（有数据/空数据/接口失败）。

### 4.5 M3 长跑采样增强

修改 `scripts/perf/pet-longrun.mjs`：

- 页面内新增 `PerformanceObserver({ type: 'longtask' })` 计数与最大时长。
- 采样结果新增 `rafP50Ms`、`longTasks`、`longTaskMaxMs`、`resources`（来自 `window.__vrmDebug?.resources()`，缺失时 `null`）。
- 汇总新增 `rafP50AvgMs`、`longTasksTotal`、`resourcesPeak`、`resourcesEnd`。
- 新增 `--summary-out <path>`：把 `summary` 写成独立 JSON；缺省仍只写 JSONL。
- 既有参数、JSONL 字段与 `__petDebug` 前置校验保持兼容。

### 4.6 M3 短跑门禁

新增 `scripts/perf/perf-budget.mjs`：

- 参数：`--url`、`--duration-min 10`、`--sample-ms 10000`、`--interval-min 1`、
  `--baseline docs/perf/baseline-v4.1.json`、`--write-baseline`、`--strict-machine`、`--out .tmp/perf-budget.json`、`--models <a,b>`。
- 复用 `pet-longrun` 的假 `wbfm.pet` 注入，并额外捕获 `onModelChange` 回调 → `window.__perfSwapModel(id)`。
- 场景时间线：待机 20% → 主动播放 20%（`__petDebug.playScene`）→ 模型热替换 30%（每 20s 切换一次）→ 小剧场进出 30%
  （`__perfNav.push('/stage?stage=play')` 停留 20s → 回 `/pet`，共 10 次）。
- 每次采样记录 p50/p95、堆、DOM、资源计数与错误数；结束时计算峰值与末值。
- 基线：`--write-baseline` 写版本、时间、硬件指纹（CPU 型号、内存、平台、架构）、分辨率、模型 id 与指标。
- 门禁：按方案 §4.5 阈值比较；失败逐条打印「指标 / 基线 / 当前 / 阈值」，退出 1；基线缺失退出 2；硬件不一致默认警告。
- 根 `package.json`：`"check:perf": "node scripts/perf/perf-budget.mjs"`、`"perf:baseline": "node scripts/perf/perf-budget.mjs --write-baseline"`。

新增 `apps/web/src/app/perf-nav-debug.tsx`：

- `'use client'`；`useEffect` 内仅在 `process.env.NODE_ENV !== 'production'` 安装
  `window.__perfNav = { push(href) { router.push(href); } }`，卸载时删除。
- 在 `apps/web/src/app/layout.tsx` 挂载 `<PerfNavDebug />`。

### 4.7 M4 收尾

- 新增 `docs/perf/baseline-v4.1.json`（运行生成后提交；硬件不同则标注）。
- `docs/plan/v4.1/progress-log.md` 记录 M1–M4 工作日志与命令输出摘要。
- 不升版本号、不打 tag；发布动作留待用户确认。

## 5. 数据与兼容

- 数据库零迁移；只把 `maxStored` 常量 20 → 50，旧记录读取逻辑不变。
- 评分/排序实现从 web 目录移入 shared，web 同名导出保持签名；唯一新增可选末参，旧调用不变。
- 设置页新增区块只读，不改变现有开关、预算与决策列表行为。
- 评测脚本只读 SQLite，不写任何 settings 键；性能脚本只在 `.tmp` 与 `docs/perf` 写文件。

## 6. 验证计划

| 项 | 命令 / 方法 | 通过标准 |
|---|---|---|
| shared 打分 | `pnpm --filter @wbfm/shared test` | 新增与既有全绿 |
| web Utility 零回归 | `pnpm --filter @wbfm/web exec vitest run src/features/avatar/script/utility` | 现有用例不改通过 |
| 质量 API/卡 | `pnpm --filter @wbfm/web exec vitest run src/features/settings/script` | 有数据/空/失败三态通过 |
| 评测脚本 | `pnpm eval:companion -- --db=<本地库>` | 报告含回放与 12 组矩阵，退出 0 |
| 长跑冒烟 | `node scripts/perf/pet-longrun.mjs --duration-min 3 --interval-min 1 --summary-out .tmp/longrun-summary.json` | 汇总含 p50/长任务/资源 |
| 短跑门禁 | `node scripts/perf/perf-budget.mjs --duration-min 3 --write-baseline` 后同参数复跑 | 首跑写基线，复跑 PASS |
| 全量门禁 | `pnpm check` + `pnpm test` | 全绿；单文件 ≤300 行 |

## 7. 已决问题

| 编号 | 决策 |
|---|---|
| D1 | 候选 07 只做 A+B，不做在线 A/B |
| D2 | 候选 11 只做 A+B；门禁本地执行，不接工蜂 CI |
| D3 | 打分契约下沉 shared，web 只留 shim |
| D4 | 决策历史上限 50，展示仍 5 |
| D5 | 「门控拒绝原因」以预算/勿扰/未播快照表达，不新增运行时计数 |
| D6 | 阈值采用相对基线（p50 ×1.2+2ms、p95 ×1.25+3ms、堆 +48MB、资源 +4） |
| D7 | 模型热替换用假 bridge 回调驱动；小剧场进出用 dev-only `__perfNav`，不改业务逻辑 |

## 8. 批准清单

- [ ] 同意 v4.1 范围仅含候选 07A+B 与 11A+B
- [ ] 同意打分契约下沉 `@wbfm/shared/script`
- [ ] 同意决策历史上限 50、设置页仍展示 5
- [ ] 同意性能门禁本地执行、相对基线阈值
- [ ] 同意新增 dev-only `window.__perfNav` 用于短跑场景
