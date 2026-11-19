# v4.12 接线补全与意图可观测性：排查与提升计划

> 触发：v4.11 发现「意图标签只记录、不进入主智能体」这类最后一公里缺口。
> 目标：把「已经存在但用户感觉不到 / 有数据但没展示 / 有开关但没行为」的断点集中清一轮，再回到新功能开发。

## 0. 结论

本轮排查确认：核心能力大多已实现，问题集中在**接线与表达**，不是缺功能。优先级最高的是意图闭环：标签已注入主智能体，但用户与面板看不到「注入了什么、是否注入、是否建议任务模式」。其次是几个「后端有、前端没入口」的小能力。

## 1. 排查发现

| # | 发现 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| F1 | `suggestedTaskMode` 只计算不消费 | `turn-intent.ts:109`；`context-intelligence.ts:31`；前端只读 kind/confidence/signals/source | 用户不知道「这轮适合任务模式」 | P0 |
| F2 | 意图提示是否注入不可见 | `intent-stage.ts` 原只落 `TurnIntent`；`context-insights-panel.tsx` 无该字段 | 无法核对 v4.11 意图提示是否生效 | P0 |
| F3 | 入门模板注释与现状不符 | `starter-templates.ts:194` 称「助手表单暂未支持技能」，但 `assistant-form-dialog.tsx:233` 已支持 | 误导维护者 | P0（注释） |
| F4 | mod 包导入历史有接口无入口 | `apps/web/src/app/api/mod-packs/installs/route.ts:8`；`API.modPackInstalls` 无消费 | 导入后无法回看来源与时间 | P1 |
| F5 | 记忆清空只支持全量 | `schemas/chat/memory.ts:44` 支持 `status`；`memory-panel.tsx:166` 只调全量清空 | 无法只清「已归档」 | P1 |
| F6 | `event.fire` / `chat.request` 动作为空实现 | `action-executor.ts:81-88`；v2.1 文档已标注未实现 | 互动图配置了也不生效 | P2 |
| F7 | 部分 API 常量无消费 | `API.modPackInstalls`、`API.spill` 等 | 死代码/误导 | P2 |
| F8 | 视觉巡检仍为人工 | `.github/workflows/nightly.yml` 只跑确定性验收 | MCP/Midscene 需凭据，非阻断 | P2 |

排除的误报：`intentClassifierModelId` 在 schema 中已是 `.nullable()`；`turn_intent`、`context_snapshot`、`context_condensed` 均已有面板消费；`skillVersions`、`branches` 等常量虽未直接出现，但通过 hooks/QUERY_KEYS 使用。

## 2. 本轮范围（P0）

1. `TurnIntent` 增加可选 `hintApplied`，由 `runIntentStage` 记录「本轮是否真的注入行为提示」。
2. 上下文面板展示：
   - `suggestedTaskMode` → 「建议：本轮适合任务模式（不会自动切换）」；
   - `hintApplied` → 「主智能体提示：已注入 / 未注入（低置信度）」。
3. 每轮 `done` / `error` 后失效上下文事件查询，面板无需手动刷新。
4. 修正入门模板中关于助手级技能的过期注释。

明确不做：不新增 SSE `intent` 事件、不自动切换任务模式。任务模式建议若要在发送前出现，需要先做「草稿意图识别」，属于独立实验（见 §4 P3）。

## 3. 后续（P1 / P2）

| 优先级 | 项 | 验收 |
|---|---|---|
| P1 | mod 包导入历史面板 | 设置页显示包名/时间/导入项数，数据来自 `/api/mod-packs/installs` |
| P1 | 记忆清空按状态过滤 | 面板提供「清空已归档」，请求体带 `status` |
| P2 | `event.fire` / `chat.request` | 要么接入 EventDirector/聊天入口，要么在互动图编辑期明确标为不支持 |
| P2 | API 常量清理 | 删除确认无消费的常量，或补上入口 |
| P2 | 视觉巡检 | 有模型凭据后再接 Playwright MCP / Midscene，不阻断 |

## 4. P3 实验项（不承诺）

- 发送前意图建议：对草稿文本先跑规则/小模型，命中 `tool_task` 时在发送按钮旁提示「用任务模式发送」。
- 意图分类质量面板：最近 20 轮分布、fallback 率、分类器命中率，帮助判断是否值得开启小模型。

## 5. 验收

- `pnpm check` 通过。
- `pnpm --filter @wbfm/core test`、`pnpm --filter @wbfm/web test` 通过。
- `pnpm eval:acceptance` 6/6 不变。
- 上下文面板在无 `hintApplied` 的旧事件上不报错（字段可选）。
- 建议任务模式只展示，不改变发送路径。

## 6. 实施记录（P0）

| 项 | 落点 | 状态 |
|---|---|---|
| `hintApplied` 契约 | `packages/shared/src/schemas/chat/context-intelligence.ts` | 完成 |
| 意图阶段记录 | `packages/core/src/chat/orchestrator/intent-stage.ts` | 完成 |
| 面板展示 | `apps/web/src/features/chat/context-insights/context-insights-panel.tsx` | 完成 |
| 查询失效 | `apps/web/src/features/chat/hooks/use-chat-session.ts` | 完成 |
| 过期注释 | `apps/web/src/lib/templates/starter-templates.ts` | 完成 |
| 测试 | `context-events.test.ts` + shared/core/web 现有测试 | 完成 |
| mod 包导入历史 | `apps/web/src/features/settings/storage/mod-pack-panel.tsx` | 完成（P1） |
| 记忆清空按状态 | `memory-clear` 后端仍为全量，保留 P1 | 待做 |
