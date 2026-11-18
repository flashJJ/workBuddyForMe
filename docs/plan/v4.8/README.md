# v4.8 对话上下文有策略

> 状态：开发完成（M0–M5，含离线评测与真机验收；4.8.1 小窗口修复）
> 主题：意图路由、按意图装配、压缩事件化、记忆一等意图与本地观测

| 文档 | 内容 |
|---|---|
| [调研与实施计划](./00-context-intelligence-plan.md) | 现状、业界参考、方案、里程碑、风险与实施记录 |
| [Spec](./spec.md) | 契约、逐文件改动、行为规范与测试 |
| [Tasks](./tasks.md) | T1–T5 任务与验收 |
| [版本总结](./version-summary.md) | 交付结果、关键设计、真机数据与已知限制 |

核心落点：

- `TurnIntent` 与规则 + 小模型分类器；
- `ContextPlan` 按意图分配 tail/middle/memory/evidence；
- `context_condensed` 四种触发与保真校验；
- 「记住 / 忘掉」一等意图；
- 上下文面板与 `eval-context` 9 用例。
