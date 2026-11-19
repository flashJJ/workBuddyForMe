# v4.10 上下文可见

> 状态：已发布 v4.10.0（M0–M5，含门禁、评测与浏览器验收）
> 主题：跨场景快照面板、截断解释与快照构成增量

| 文档 | 内容 |
|---|---|
| [调研与实施计划](./00-context-observability-plan.md) | 现状、方案、里程碑、验收、风险与实施记录 |
| [Spec](./spec.md) | 契约、逐文件改动、行为规范与测试 |
| [Tasks](./tasks.md) | T1–T9 任务与验收 |
| [版本总结](./version-summary.md) | 交付结果、关键设计、验证数据与已知限制 |

核心落点：

- 快照增加 `systemTokens` / `inputTokens` / `messageCount`；
- `context-snapshots` 共享解析、hook 与面板；
- 协作卡、任务详情、Flow 执行面板三处接入；
- Flow 改为「首节点基线 + 截断追加」；
- 截断警告与可执行建议。
