# 候选方案（未排期）

> 未进入版本排期的候选方案放这里，按创建顺序编号：`NN-slug.md`（NN 为两位数字）。

## 规则

1. 候选只写「问题、现状证据、可选方案、风险、待决策」，不写实施记录。
2. 编号只增不复用；一个候选一个文件，避免多主题塞进同一篇。
3. 一旦进入版本排期：
   - `git mv candidates/NN-slug.md scheduled/vX.Y-NN-slug.md`；
   - 在 [scheduled/README.md](../scheduled/README.md) 登记版本、状态与正式方案链接；
   - 在 [roadmap README](../README.md) 的版本索引/规划中区块登记。
4. 正式版本方案正文放 `docs/plan/vX.Y/`，候选文件保留为来源方案，不复制正文。

## 当前候选

| 编号 | 主题 | 来源 | 价值 | 成本 |
|---|---|---|---|---|
| [01](01-memory-graph-and-consolidation.md) | 记忆图关系边与空闲整理 | v2.26 局限 | 中高 | 高 |
| [03](03-capability-and-content-pack-completion.md) | 能力生态与内容包收口 | v2.17 / v2.18 已知边界 | 中 | 中 |
| [04](04-document-quality.md) | 文档质量收口（存量重解析 / OCR / 关系抽取） | v2.19 已知边界 | 中高 | 中高 |

v2.28 已立项为「记忆可管：统计前端、审计轮转与约束撤销」，候选 02 已移至 [v2.28-01](../scheduled/v2.28-01-memory-observability-and-governance.md)。v2.27 已立项为「引用角标、来源定位与回合运行摘要」，来源方案见 [v2.27-01](../scheduled/v2.27-01-citation-and-turn-summary.md)。Lancer 借鉴分析已排期并归档为 [v2.20-01](../scheduled/v2.20-01-lancer-borrowing-analysis.md)，拆分到 [v2.20 方案](../../plan/v2.20/README.md)（P0+P1）与 [v2.21 方案](../../plan/v2.21/README.md)（P2）；自由分支的来源方案见 [v2.21-01](../scheduled/v2.21-01-free-branch-sessions.md)。

v2.17 的两个来源方案已归档到 [scheduled/](../scheduled/)。v2.18 的五个开源借鉴项已在 [能力借鉴分析](../../plan/v2.18/00-能力借鉴分析.md) 中逐项定级：Diagram Design / HowToLiveBetter 已纳入方案；REA / Moli 仅借思路；ArtCraft 不移植，暂不单独建候选。
