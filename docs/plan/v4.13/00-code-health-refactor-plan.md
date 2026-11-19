# v4.13 代码健康度与重构优化计划

> 触发：v4.12 完成后做一轮代码体检。目标不是「全仓重写」，而是把发布正确性、热点文件、目录预算与门禁补强逐批处理，每批可独立回滚。
> 原则：零行为变更；先补测试/冒烟，再搬代码；不引入新依赖、不改公开 API。

## 0. 结论

- **已修复 P0**：`@wbfm/core/context` 的生产子路径原先指向根 bundle，但根 barrel 未聚合 `context`，导致 Next 构建持续报 `recordSceneSnapshot/buildSceneSnapshot` 缺失。直接聚合进根 barrel 会与 `chat/context` 形成运行期循环（`next start` 健康检查 500），最终改为**独立 tsup 入口 `dist/context.*`**，与 `voice`/`event-client` 同模式。
- 当前主要债务集中在三类：**290–300 行热点文件**、**30 个目录超 12 文件且复核日期已过期**、**构建产物/子路径缺少冒烟**。
- 已新增 `pnpm check:exports`：按 `exports.import` 加载真实产物并断言关键符号，CI 在 `pnpm build:web` 之后执行。

## 1. 排查结果

| # | 发现 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| F1 | 根 barrel 未聚合 `context`，子路径指向根 bundle | `packages/core/src/index.ts`；`pnpm build:web` 报 Attempted import error | 生产任务模式符号缺失；直接聚合会引发运行期循环 500 | P0（已修复：独立入口） |
| F2 | 136 个文件 ≥260 行，多个 290–300 | `pnpm check:lines`；`memory-service.ts` 300、`turn-context-assembly.ts` 300、`audit-page.tsx` 299、`mcp/registry.ts` 299、`stage-root.tsx` 299、`stage-toolbar.tsx` 299、`settings.ts` 299、`use-chat-session.ts` 294 | 接近硬门禁，任何新增都要先拆 | P1 |
| F3 | 30 个目录超 12 文件，理由多为「到期 v4.11 复核」 | `scripts/.structure-baseline.json` | 目录职责扩散，复核过期 | P1 |
| F4 | `endpoints.ts` 293 行仍在白名单，理由是「v2.32 再拆」 | `scripts/.lines-whitelist.json` | 已跨 10+ 版本，路径与 Query key 混在一处 | P2 |
| F5 | CJS 构建告警 `import.meta` | `packages/core/src/backup/app-version.ts:23` | CJS 分支虽有 `__dirname` 守卫，仍产生噪声告警 | P2 |
| F6 | 构建产物/子路径无冒烟 | 本次新增 `check:exports` 前无任何 dist 级断言 | 根 barrel 漏聚合可静默进入生产 | P0（已补） |
| F7 | 未做未使用导出/依赖审计 | 无 knip/ts-prune 记录 | 死代码与冗余依赖不可见 | P2 |
| F8 | web 全量测试 291 文件 / 1482 用例 | 本次全量运行 | 单次约 2–3 分钟，尚可接受 | P3 |
| F9 | 目录预算只冻结不下降 | baseline `version: v2.16-M5` | 债务长期不收敛 | P2 |

## 2. 分批计划

### Batch 0：发布正确性（已完成）

- `packages/core` 新增独立入口 `context: src/context/index.ts`，`package.json` 的 `./context` 生产条件改指 `dist/context.mjs|cjs`。
- 根 barrel 保持不聚合 `context`（聚合会导致 `next start` 健康检查 500，已反向验证）。
- 新增 `scripts/check-package-exports.mjs`：按 `exports.import` 解析 dist，断言 `recordSceneSnapshot/buildSceneSnapshot/estimateTokens`、`turnIntentSchema/detectTurnIntent/contextPlanSchema`、`SSE_EVENT`。
- `package.json` 新增 `check:exports`；CI 在 `build:web` 后执行。
- 验证：`pnpm build:web` 不再出现 Attempted import error；`pnpm check:exports` 3 个子路径通过；`next start` 健康检查 200；验收 6/6。

### Batch 1：chat 上下文域拆分（P1）

目标：`turn-context-assembly.ts` 300 → ≤220；`chat/context` 直接文件 26 → ≤12。

- 拆 `assembly/history.ts`（历史条数、图片映射、预判压缩）。
- 拆 `assembly/prompt.ts`（system 区块、技能/计划/记忆块组装）。
- 拆 `assembly/tools.ts`（工具声明、lean 回合、工具消息预算）。
- 将 `intent/`、`window/`、`compression/` 收敛为子目录 + barrel。
- 保持 `prepareTurnContext` 公开签名不变；测试断言零改。

### Batch 2：memory 域拆分（P1）

目标：`memory-service.ts` 300 → ≤220；`memory-repo.ts` 295 → ≤220。

- 外迁 `lifecycle/clear.ts`（`clearAll` / `clearByStatus`）。
- 外迁 `lifecycle/stats.ts`（`getStats` / 审计轮转）。
- `memory-repo` 的 events/lifecycle 访问收敛到子仓储，主仓储只保留记忆 CRUD。
- 测试：`memory-service.test.ts`、`memory-clear-status.test.ts`、`memories.test.ts`、`memory-panel.test.tsx`。

### Batch 3：web 对话会话拆分（P1）

目标：`use-chat-session.ts` 294 → ≤220。

- 外迁 `use-chat-stream-handlers.ts`（SSE 事件 switch：meta/delta/tool/done/error/intent）。
- 外迁 `use-chat-turn.ts`（send/retry/stop 与计时、通知）。
- `chat-page.tsx` 272 只保留页面装配。
- 测试：`use-chat-session.test.tsx`、`chat-page.test.tsx`、`composer.test.tsx`。

### Batch 4：API 常量域化（P2）

目标：`endpoints.ts` 293 → 域文件各 ≤120。

- 拆 `lib/api/endpoints/{chat,memory,knowledge,work,settings,media,agent}.ts`，保留 `endpoints.ts` barrel 兼容。
- 删除 `scripts/.lines-whitelist.json` 中的 `endpoints.ts` 条目。
- 机械替换导入，不改调用点语义。

### Batch 5：目录预算 burn-down（P2）

每轮选 2 个 legacy 目录，目标把 baseline 计数下降而不是只冻结：

- `packages/core/src/backup` 31 → `export/`、`restore/` 两个子域。
- `packages/core/src/ingestion` 27 → `parse/`、`chunk/`、`ocr/`。
- 每次更新 `scripts/.structure-baseline.json` 的 count 与 reason，过期版本统一改为实际版本。

### Batch 6：测试与门禁补强（P2）

- 新增构建告警门禁：`pnpm build:web` 日志出现 `Attempted import error` 即失败（或由 `check:exports` 覆盖同类问题）。
- 一次性 `knip`/`ts-prune` 审计，删除确认无消费的导出与依赖；初期不做阻断门禁。
- 测试运行预算：web 全量 < 3 分钟；超出再按域拆 vitest project。
- 子路径导出冒烟扩展到 `@wbfm/core/event-client` 等纯逻辑入口。

## 3. 验收口径

- `pnpm check` 通过；行数警告从 136 降到 ≤120（每轮至少 -8）。
- `pnpm build:web` 无 `Attempted import error`。
- `pnpm check:exports` 通过。
- core / shared / web 全量单测通过；`pnpm eval:acceptance` 6/6。
- 结构 baseline 无增长，且至少有 2 个 legacy 目录计数下降。

## 4. 非目标

- 不重写编排架构、不改 UI/业务行为、不引入新运行时依赖。
- 不追求清零 136 个行数警告，只处理 290–300 区间与高 churn 文件。
- 不把 `event.fire` 实现、视觉巡检等新功能塞进本轮。

## 5. 实施记录

| 批次 | 内容 | 状态 |
|---|---|---|
| Batch 0 | 独立 `context` 入口 + `check:exports` + CI | 完成 |
| Batch 0 | `build:web` 构建告警消失；`next start` 健康检查 200；验收 6/6 | 完成 |
| Batch 1–6 | 见上 | 待排期 |
