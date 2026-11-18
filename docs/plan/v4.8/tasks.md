# v4.8 上下文评测专项：Tasks

> 依赖：[spec.md](./spec.md) 批准后执行。全部任务不改运行时代码。

## [x] T1 新增 golden 数据

- 文件：`scripts/eval/context-golden.json`
- 内容：
  - `intentCases[4]`：`id/text/expectKind/expectTail`
    （chitchat 0.5=低置信度回落旧配额、knowledge 0.35、follow_up 0.6、clarify 0.55）
  - `memoryKeyword: "青鸟计划"`、`memoryCases[2]`（remember/forget，均期望 `memory_write`）
  - `quotaTolerance: 0.04`
  - `longTurns[4]`：每条 150–300 字、含不同事实，用于形成 8 条消息
  - `compaction: { minFolded: 1, maxHistoryRatio: 0.75 }`
- 完成判据：JSON 可被 `JSON.parse`，字段与 spec §4 一致。

## [x] T2 新增评测脚本

- 文件：`scripts/eval/eval-context.mjs`
- 复用：`lib/http.mjs`（api）、`lib/sse-client.mjs`（streamChat）、
  `lib/assertions.mjs`（allChecks/outputNotEmpty）、`lib/report.mjs`
  （summarize/printSummary/writeReport）、`lib/mock-seed.mjs`（ensureMockStack）
- 内部纯函数：
  - `latestEvent(events, type)`：取最新同类事件
  - `quotaCheck(snapshot, expectTail, tolerance)`：返回 `{pass, reason}`
  - `budgetInvariant(snapshot)`：返回 `{pass, reason}`
  - `chat(...)`：发送一轮并校验 `stream.error`
- 流程：
  1. `ensureMockStack` → `assistantId`；临时 PATCH 最小助手配置（记忆开、
     角色卡/工具/技能/表情指令下线），结束后按原值还原
  2. 逐条跑 4 个意图用例（各自新会话）
  3. 跑 2 个记忆用例（同一会话，顺序 remember → forget）
  4. 跑压缩会话（4 轮长文本 → compact → 再 1 轮）
  5. 汇总所有 snapshot 跑预算不变量
  6. `summarize/printSummary`，`--out` 可选写报告
- 完成判据：`node scripts/eval/eval-context.mjs` 语法通过（无 mock 服务时报退出码 2 且信息可读）。

## [x] T3 接入脚本入口

- 文件：`package.json`
- 在 `eval:agent` 附近增加 `"eval:context": "node scripts/eval/eval-context.mjs"`。
- 完成判据：`pnpm run` 列表可见该命令。

## [x] T4 文档更新

- 文件：`docs/plan/v4.8/00-context-intelligence-plan.md`
  - §4.6：评测落点从「扩展 eval-agent.mjs」改为「新增 eval-context.mjs」，
    并写明协作域/聊天域分离的理由；
  - §10：M5 行补「context-golden.json + eval-context.mjs（9 用例）」；
  - 已知边界：删除「评测脚本尚未新增上下文专项用例」，补「语义保真（数字/URL 引用）
    需真机验收，mock 只做结构化断言」；
  - 状态行改为「开发完成（含上下文评测门禁；待真机体验验收）」。
- 完成判据：文档中不再存在「评测门禁未接入」的表述。

## [x] T5 门禁与自检

- 运行：`pnpm check:lines`、`pnpm check:ascii`
- 若新增/改动仅 .mjs 与 .md，无需 `pnpm typecheck`；如 T2 意外触及 TS，则补跑 `pnpm typecheck`。
- 完成判据：两条门禁均退出 0。

## [x] T6 提交

- 提交信息：`test(v4.8): 新增上下文智能调控评测与门禁`
- 提交内容：`scripts/eval/context-golden.json`、`scripts/eval/eval-context.mjs`、
  `package.json`、`docs/plan/v4.8/00-context-intelligence-plan.md`
- 完成判据：`git status` 干净，提交仅含上述文件。
