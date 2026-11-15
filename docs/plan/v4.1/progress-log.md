# v4.1 进度与决策留痕

> 用途：记录 v4.1 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v4.1 方案](./README.md) · [Spec](./spec.md) · [Tasks](./tasks.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案/Spec/Tasks 落盘，07/11 转正，三处索引已更新） | 2026-11-15 |
| M1 打分契约下沉 | ✅ 完成（shared/script 契约、权重可选末参、历史 50） | 2026-11-15 |
| M2 评测与质量卡 | ✅ 完成（回放/矩阵/指标、eval 脚本、质量 API 与只读卡） | 2026-11-15 |
| M3 性能门禁 | ✅ 完成（p50/长任务/资源采样、短跑门禁、3 分钟冒烟 PASS） | 2026-11-15 |
| M4 收尾 | ⏳ 待开始 | — |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-15 | 候选 07 只做离线回放 + 场景矩阵，不做在线 A/B | 单机单用户样本不足，A/B 分流会污染决策链路 | 若未来有多用户样本再评估 |
| D2 | 2026-11-15 | 候选 11 做 4h 基线归档 + 10 分钟本地短跑门禁，不接工蜂 CI | 工蜂无 CI；机器差异大，只做相对基线 | 若引入 CI 固定机型再改 |
| D3 | 2026-11-15 | 打分与排序契约下沉 `@wbfm/shared/script`，web 保留 shim | 离线脚本必须复用同一打分器；shim 保证现有 import 与测试零改动 | 无 |
| D4 | 2026-11-15 | 决策历史上限 20 → 50，设置页仍展示 5 | 回放需要更长窗口；展示区不变避免干扰 | 若回放仍不足再评估 100 |
| D5 | 2026-11-15 | 「门控拒绝原因」用预算/勿扰/未播快照表达，不新增运行时计数 | 保持决策链路零改动，避免为评测引入埋点 | 若需要逐次拒绝率再单独设计 |
| D6 | 2026-11-15 | 性能阈值用相对基线：p50 ×1.2+2ms、p95 ×1.25+3ms、堆 +48MB、资源 +4 | 绝对帧率受机器与软件渲染影响 | 基线稳定两版后可收紧 |
| D7 | 2026-11-15 | 模型热替换由假 bridge 回调驱动；小剧场进出用 dev-only `__perfNav` | 不侵入业务；生产不安装 | 若后续有正式场景切换 API 再替换 |

## 工作日志

### 2026-11-15 M0 方案与 Spec

- 新增 `docs/plan/v4.1/README.md`：范围 07A+B、11A+B；非目标含在线 A/B、绝对帧率、CI 接入。
- 新增 `docs/plan/v4.1/spec.md`：记录现状依据、模块签名、文件清单、验证命令与已决问题。
- 新增 `docs/plan/v4.1/tasks.md`：M0–M4 可勾选任务。
- 候选 07/11 已移入 `docs/roadmap/scheduled/`，三处索引已更新。

### 2026-11-15 M1 打分契约下沉与历史扩展

- 新增 `packages/shared/src/script/{types,score,select,index}.ts`：Utility 打分、候选提取与确定性排序原样迁移；`scoreCandidate`/排序函数增加可选 `weights` 末参，默认值不变。
- `packages/shared/package.json` 增加 `./script` 子路径；根 barrel 补充导出；web `utility/{types,score,select}.ts` 改为 re-export，`index.ts` 与 `trigger.ts` 未改。
- `PET_SCRIPT_DECISION_LIMITS.maxStored` 20 → 50，设置页仍展示 5 条；中英提示同步。
- 验证：shared 42 文件 390 项通过、`tsc --noEmit` 通过；web Utility 12 项零改动通过；web `tsc --noEmit` 通过。
- 结果：离线评测与线上共用同一打分器，现有 import 与测试无需修改。
- 下一步：M2 评测纯函数、脚本与质量卡。

### 2026-11-15 M2 评测纯函数、脚本与质量卡

- 新增 `packages/shared/src/script/eval/{types,matrix,replay,metrics}.ts`：12 组固定上下文、候选快照转换、矩阵与排名差异、离线回放（基础维度重算 + 记录去重/偏好增量）、质量指标汇总。
- 新增 `scripts/eval/companion-report.mjs` 与 `companion-fixtures.json`：只读 SQLite，读取五个 settings 键，输出回放/矩阵/指标/门控报告；根命令 `eval:companion`。
- 新增 `GET /api/pet/script/quality` 与 `createPetScriptServer(...).quality()`：聚合决策、生成队列、播放预算与勿扰状态，复用 shared 统计。
- 新增 `ScriptQuality` 只读卡，挂载在 AI 日常剧情面板；中英文案与三态测试（有数据/空/接口失败）。
- 验证：shared 7 文件 50 项（i18n + script）通过；settings/script 3 文件 6 项通过；web `tsc --noEmit` 通过。
- 本地报告：3 条决策可回放 2、缺失 1，均值差 0.09；12 组矩阵 × 7 个生成候选；权重覆盖可输出 22 处排名变化。
- 下一步：M3 性能采样增强与短跑门禁。

### 2026-11-15 M3 性能采样与短跑门禁

- `pet-longrun.mjs`：新增 rAF p50、长任务计数/最大时长、`__vrmDebug.resources()` 快照与 `--summary-out` 归档；原参数与 JSONL 字段保持兼容。
- 新增 `scripts/perf/perf-budget.mjs`：待机 → 主动播放 → 模型热替换 → 小剧场进出四段场景；基线含硬件指纹、分辨率与模型；阈值按 p50 ×1.2+2ms、p95 ×1.25+3ms、堆 +48MB、资源 +4、错误 0。
- 新增 dev-only `PerfNavDebug`（`window.__perfNav`），根布局挂载；生产不安装。
- 3 分钟冒烟（SwiftShader）：基线 p95 1.757ms、堆峰值 227.9MB、资源峰值 24/56/6；复跑 p95 1.613ms、堆 202.2MB、资源末值 20/48/5，7 项全 PASS。
- `pet-longrun` 3 分钟冒烟：p50 0.025ms、p95 1.725ms、长任务 2 次（最大 87ms）、资源末值 24/56/6，`--summary-out` 正常落盘。
- 下一步：M4 全量测试、门禁与收尾。



