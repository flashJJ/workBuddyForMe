# v4.8 上下文评测专项：Spec

> 状态：待批准
> 上游：[00-context-intelligence-plan.md](./00-context-intelligence-plan.md)（M0–M5 已开发完成）
> 本 Spec 只补「验收阶段」缺失的离线评测门禁，不改运行时代码。

## 1. 背景与目标

v4.8 已交付意图识别、按意图分块配额、压缩事件化、记住/忘掉与上下文面板，
但计划 §10「已知边界」明确留了一项缺口：

> 评测脚本 `eval-agent.mjs` 尚未新增上下文专项用例，指标门禁留到验收阶段接入。

本 Spec 的目标：新增一个可在 `WBFM_MOCK_AI=1` 服务上离线、确定性运行的上下文评测脚本，
把 M1–M4 的验收项转成可回归的断言，并把结果写入 `--out` JSON 报告。

### 非目标

- 不在 mock 下断言「跨轮引用具体数字/URL」这类语义保真——mock 模型不回放历史语义，
  语义保真留真机体验验收；本脚本只做结构化断言（意图、配额、事件、预算、折叠范围）。
- 不改 `packages/core`、`apps/web` 的运行时代码。
- 不做 v4.9 统一 Context Controller。

## 2. 前置条件

与 `scripts/eval/eval-tool-compact.mjs` 一致：Web 服务以 `WBFM_MOCK_AI=1` 启动，
默认 `http://127.0.0.1:3200`，可用 `--base-url=` 覆盖。脚本内部用
`scripts/eval/lib/mock-seed.mjs#ensureMockStack` 幂等准备供应商/模型/默认设置。

## 3. 数据源（已确认的契约）

| 来源 | 形态 | 用途 |
|---|---|---|
| `GET /api/events?scope=chat&scopeId=<id>&limit=500` | `{ events, items }`，事件含 `type/payload/seq` | 读回三张上下文事件 |
| `turn_intent` payload | `TurnIntent`：`kind/confidence/signals/suggestedTaskMode/source` | 意图路由断言 |
| `context_snapshot` payload | `intent/contextWindow/usableWindow/systemTokens/toolsTokens/reserveTokens/historyBudget/historyTokens/keptMessages/droppedMessages/truncated` | 配额与预算不变量 |
| `context_condensed` payload | `trigger/foldedMessageIds/summary/facts/decisions/openLoops/beforeTokens/afterTokens/fidelityMissing/degraded` | 压缩事件断言 |
| `POST /api/conversations/:id/compact` | `{ compactedTurns, summary }` | 用户显式压缩 |
| `GET /api/memories?search=&status=active&limit=` | 记忆数组 | 记住/忘掉 |
| `POST /api/chat/stream` | SSE（`content/events/error/usage`） | 产生对话轮次 |

配额真源：`packages/core/src/chat/context/context-plan.ts` 的 `INTENT_QUOTAS`
（chitchat 0.60 / knowledge 0.35 / follow_up 0.60 / tool_task 0.40 /
clarify 0.55 / memory_write 0.55 / reminder 0.55，tail 项）。

## 4. 用例设计（9 条）

### 4.1 意图 + 配额（每条独立会话）

| id | 输入文本 | 期望 kind | 期望 tail 占比 |
|---|---|---|---|
| `intent-chitchat` | 嗨，晚上好呀 | `chitchat` | 0.50（低置信度回落旧配额） |
| `intent-knowledge` | RAG 的定义是什么？ | `knowledge` | 0.35 |
| `intent-follow-up` | 那它和微调有什么区别 | `follow_up` | 0.60 |
| `intent-clarify` | 没听懂，你刚才说什么 | `clarify` | 0.55 |

断言：
1. 回复非空（`outputNotEmpty`）；
2. 该会话最新 `turn_intent.payload.kind === 期望`；
3. 该会话最新 `context_snapshot` 的 `historyBudget / usableWindow` 落在
   `期望 ± 0.04`（容差 `context-golden.json#quotaTolerance`）。

说明：`follow_up` 依赖 `FOLLOW_UP_RE` 的 0.72 高于 `knowledge` 的 0.70，
`reminder` 依赖 0.90 关键词，均为规则确定性结果，不依赖小模型（默认关闭）。
`reminder` 不走本链路：v1.7 M5 的「提醒我」本地解析会在意图阶段前短路，
故用 `clarify` 覆盖；`chitchat` 置信度 0.3 低于 `INTENT_LOW_CONFIDENCE`，
按设计回落旧的 50/35/10 配额，正好验证「低置信度不启用意图配额」这条边界。

评测前置：脚本会临时把助手改为最小配置（`cardId=null`、`enabledTools=[]`、
`skillNames=['__eval_context_none__']`、`expressionEnabled=false`、`memoryEnabled=true`）。
否则人格卡/内置工具/技能提示模板会把 `systemTokens + toolsTokens + reserveTokens`
抬到原文配额之上，导致所有意图都只剩同一段可用预算、配额差异被掩盖。结束后按原值还原。

### 4.2 记忆治理（同一会话，先记住后忘掉）

| id | 输入 | 断言 |
|---|---|---|
| `memory-remember` | 记住：我的项目代号是青鸟计划 | `turn_intent.kind === 'memory_write'`；`/api/memories?search=青鸟计划&status=active` 有命中 |
| `memory-forget` | 忘记：我的项目代号是青鸟计划 | `turn_intent.kind === 'memory_write'`；同查询 active 无命中（软归档） |

前置：幂等 `PATCH /api/assistants/:id { memoryEnabled: true }`，不改其它字段；
不清空记忆库（用关键字限定查询）。

### 4.3 显式压缩（专用会话）

1. 连续发送 4 条较长文本（`context-golden.json#longTurns`），形成 8 条消息；
2. 记录第 4 轮的 `context_snapshot.historyTokens`（压缩前）；
3. `POST /api/conversations/:id/compact`；
4. `compaction-event` 断言：
   - `compactedTurns >= 1` 且 `summary` 非空；
   - 最新 `context_condensed.trigger === 'user_explicit'`、`degraded === false`；
   - `foldedMessageIds.length === compactedTurns`；
   - `foldedMessageIds` 恰为 `/messages` 顺序里最早的 N 条 id（原文可按 id 读回）；
   - `beforeTokens > afterTokens`；
5. 再发一轮 `继续`，`compaction-cost` 断言：最新 `context_snapshot.historyTokens`
   `< 压缩前 × 0.75`（`context-golden.json#compaction.maxHistoryRatio`）。

### 4.4 预算不变量（聚合）

收集所有会话的全部 `context_snapshot`（预期 ≥ 8 条），逐条断言：
- `systemTokens + toolsTokens + reserveTokens + historyTokens <= usableWindow`；
- `historyTokens <= historyBudget`；
- `keptMessages >= 1`。

## 5. 文件与改动清单

| 文件 | 类型 | 改动 |
|---|---|---|
| `scripts/eval/context-golden.json` | 新增 | 输入文本、期望 kind、tail 期望、容差、长文本、压缩阈值 |
| `scripts/eval/eval-context.mjs` | 新增 | 评测编排（复用 `lib/http`、`lib/sse-client`、`lib/assertions`、`lib/report`、`lib/mock-seed`），退出码 0/1/2 |
| `package.json` | 修改 | 增加 `"eval:context": "node scripts/eval/eval-context.mjs"` |
| `docs/plan/v4.8/00-context-intelligence-plan.md` | 修改 | §4.6 评测落点改为新脚本并说明理由；§10 状态与已知边界更新 |

## 6. 脚本接口

```
node scripts/eval/eval-context.mjs [--base-url=URL] [--out=PATH]
```

- 退出码：0 全过；1 断言失败；2 基础设施错误（与现有 eval 一致）；
- 每条用例打印 `PASS/FAIL  id  reason`，末尾打印 `passed/total`；
- `--out` 写 `summarize()` 的 JSON 报告。

## 7. 验收标准

1. `WBFM_MOCK_AI=1` 服务下运行 `node scripts/eval/eval-context.mjs` → 9/9 通过、退出码 0；
2. 失败时输出可定位的实测量（实际 kind、实际配额百分比、实际 token 数）；
3. `pnpm check:lines` 通过（新增 .mjs 不在门禁扫描范围，但保持整洁）；
4. `pnpm check:ascii` 通过（文档变更）；
5. 计划文档状态更新为「开发完成（含上下文评测门禁）」。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 配额比值受 system 占用影响偏低 | 容差 ±0.04；失败信息同时打印 `historyBudget/usableWindow`；mock 助手 system 较短、available 远大于 cap |
| 「忘掉」依赖召回分 ≥0.55 | 查询文本与记忆内容同句，mock 向量余弦≈1；失败时打印 active 命中列表 |
| 压缩轮次不足导致 folded=0 | 4 轮固定输入生成 8 条消息；force 折叠 `max(4, ceil(0.4n))` 保留、其余折叠，folded 恒为 4 |
| 重复运行残留记忆 | 用例内先 remember 再 forget，且查询按关键字限定；不依赖全局清库 |

## 9. 待拍板

| 编号 | 决策 | 建议 |
|---|---|---|
| E1 | 评测落点：新增 `eval-context.mjs` vs 扩展 `eval-agent.mjs` | 新增（聊天域与协作域分离，沿用 eval-memory/eval-proactive 的按域拆分） |
| E2 | 是否加入 `package.json` 的 `eval:context` | 是 |
| E3 | 计划文档状态是否改为「开发完成（含评测门禁）」 | 是 |
