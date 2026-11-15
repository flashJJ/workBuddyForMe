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

| 编号 | 候选 | 状态 | 说明 |
|---|---|---|---|
| 07 | [陪伴质量评测](./07-companion-eval-harness.md) | 待评审 | 用决策回放与场景矩阵，把「选场是否合理」变成可回归指标 |
| 08 | [资产体积预算](./08-asset-size-budget.md) | 待评审 | 模型/贴图/morph 语义与安装包体积纳入可执行门槛 |
| 10 | [统一音频导演](./10-audio-director.md) | 待评审 | 应用音乐、剧场 BGM、语音与音效共用优先级与 duck 规则 |
| 11 | [性能预算与长跑门禁](./11-perf-budget-and-longrun-gate.md) | 待评审 | 把 4h 长跑、短跑回归与资源回收纳入版本验收 |

## 已排期版本

05（S1 + S3）与 06（方案 A）已随 v3.1.0 发布；09 的校验和部分（方案 A）已排期 v4.0，移至 [v4.0-09](../scheduled/v4.0-09-release-trust-and-update.md)，正式方案见 [v4.0 方案](../../plan/v4.0/README.md)。

v4.0 平台化一期范围：S5 依赖拓扑、06 B 内部 motion 包、`motion-pack`、S6 内容刷新与发布校验。其余候选可按「质量（07/11）→ 资产（08）→ 音频（10）」插空排期，不要求与平台化同版。


候选 02「数据可带走：备份补全、恢复预检与空间清理」已排期 v2.32，移至 [v2.32-02](../scheduled/v2.32-02-data-portability-and-storage.md)，正式方案见 [v2.32 方案](../../plan/v2.32/README.md)。候选 01「记忆图关系边与空闲整理」已排期 v2.31，移至 [v2.31-01](../scheduled/v2.31-01-memory-graph-and-consolidation.md)，社区聚类（方案 B）永久关闭。v2.30 已合入 main 为「能力补齐：能力可见、审批可读与内容包/产物收口」，候选 03 已移至 [v2.30-03](../scheduled/v2.30-03-capability-and-content-pack-completion.md)。v2.29 已发布为「文档可信：存量重解析、质量标记与低质收口」，候选 04 已移至 [v2.29-04](../scheduled/v2.29-04-document-quality.md)。v2.28 已随 v2.29.0 交付为「记忆可管：统计前端、审计轮转与约束撤销」，候选 02 已移至 [v2.28-01](../scheduled/v2.28-01-memory-observability-and-governance.md)。v2.27 已立项为「引用角标、来源定位与回合运行摘要」，来源方案见 [v2.27-01](../scheduled/v2.27-01-citation-and-turn-summary.md)。Lancer 借鉴分析已排期并归档为 [v2.20-01](../scheduled/v2.20-01-lancer-borrowing-analysis.md)，拆分到 [v2.20 方案](../../plan/v2.20/README.md)（P0+P1）与 [v2.21 方案](../../plan/v2.21/README.md)（P2）；自由分支的来源方案见 [v2.21-01](../scheduled/v2.21-01-free-branch-sessions.md)。

v2.17 的两个来源方案已归档到 [scheduled/](../scheduled/)。v2.18 的五个开源借鉴项已在 [能力借鉴分析](../../plan/v2.18/00-能力借鉴分析.md) 中逐项定级：Diagram Design / HowToLiveBetter 已纳入方案；REA / Moli 仅借思路；ArtCraft 不移植，暂不单独建候选。
