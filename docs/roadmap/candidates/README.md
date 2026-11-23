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
| — | 暂无未排期候选 | — | 候选 12 已排期 v4.4 |

## 已排期版本

05（S1 + S3）与 06（方案 A）已随 v3.1.0 发布；09 的校验和部分（方案 A）已排期 v4.0，移至 [v4.0-09](../scheduled/v4.0-09-release-trust-and-update.md)，正式方案见 [v4.0 方案](../../plan/v4.0/README.md)。

07（陪伴质量评测 A+B）与 11（性能预算与长跑门禁 A+B）已排期 v4.1，移至 [v4.1-07](../scheduled/v4.1-07-companion-eval-harness.md) 与 [v4.1-11](../scheduled/v4.1-11-perf-budget-and-longrun-gate.md)，正式方案见 [v4.1 方案](../../plan/v4.1/README.md)。

10（统一音频导演 B）已排期 v4.2，移至 [v4.2-10](../scheduled/v4.2-10-audio-director.md)，正式方案见 [v4.2 方案](../../plan/v4.2/README.md)。

08（资产体积预算 A+B）已排期 v4.3，移至 [v4.3-08](../scheduled/v4.3-08-asset-size-budget.md)，正式方案见 [v4.3 方案](../../plan/v4.3/README.md)。12（背景与壁纸）已排期 v4.4，移至 [v4.4-12](../scheduled/v4.4-12-background-wallpaper-video.md)，正式方案见 [v4.4 方案](../../plan/v4.4/README.md)。当前无未排期候选。

v4.0 平台化一期范围：S5 依赖拓扑、06 B 内部 motion 包、`motion-pack`、S6 内容刷新与发布校验。


候选 02「数据可带走：备份补全、恢复预检与空间清理」已排期 v2.32，移至 [v2.32-02](../scheduled/v2.32-02-data-portability-and-storage.md)，正式方案见 [v2.32 方案](../../plan/archive/v2/v2.32/README.md)。候选 01「记忆图关系边与空闲整理」已排期 v2.31，移至 [v2.31-01](../scheduled/v2.31-01-memory-graph-and-consolidation.md)，社区聚类（方案 B）永久关闭。v2.30 已合入 main 为「能力补齐：能力可见、审批可读与内容包/产物收口」，候选 03 已移至 [v2.30-03](../scheduled/v2.30-03-capability-and-content-pack-completion.md)。v2.29 已发布为「文档可信：存量重解析、质量标记与低质收口」，候选 04 已移至 [v2.29-04](../scheduled/v2.29-04-document-quality.md)。v2.28 已随 v2.29.0 交付为「记忆可管：统计前端、审计轮转与约束撤销」，候选 02 已移至 [v2.28-01](../scheduled/v2.28-01-memory-observability-and-governance.md)。v2.27 已立项为「引用角标、来源定位与回合运行摘要」，来源方案见 [v2.27-01](../scheduled/v2.27-01-citation-and-turn-summary.md)。Lancer 借鉴分析已排期并归档为 [v2.20-01](../scheduled/v2.20-01-lancer-borrowing-analysis.md)，拆分到 [v2.20 方案](../../plan/archive/v2/v2.20/README.md)（P0+P1）与 [v2.21 方案](../../plan/archive/v2/v2.21/README.md)（P2）；自由分支的来源方案见 [v2.21-01](../scheduled/v2.21-01-free-branch-sessions.md)。

v2.17 的两个来源方案已归档到 [scheduled/](../scheduled/)。v2.18 的五个开源借鉴项已在 [能力借鉴分析](../../plan/archive/v2/v2.18/00-能力借鉴分析.md) 中逐项定级：Diagram Design / HowToLiveBetter 已纳入方案；REA / Moli 仅借思路；ArtCraft 不移植，暂不单独建候选。
