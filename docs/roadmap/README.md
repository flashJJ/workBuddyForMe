# 产品路线图与版本迭代方案

> 本文件夹是版本迭代方案与发布记录的归档处。
> 根目录保留已发布版本总结/发行说明与索引；候选与已排期方案放进子文件夹；正式版本方案正文放 `docs/plan/vX.Y/`。

## 规划原则

1. **一个版本一个主题**：不贪多，主题内做到闭环可用，拒绝半成品功能堆积。
2. **本地优先不动摇**：数据留在本机、无强制云服务、密钥不出本机——所有版本必须遵守的宪法。
3. **先疼后美**：优先解决「用起来单调/缺失」的能力断点，再做体验美化。
4. **延续工程宪法**：TS strict、单文件 ≤300 行、外部调用测试 mock、四层测试不降级。
5. **方案先于编码**：版本开工前方案必须经过取舍评审（Non-Goals 与功能清单同等重要）。
6. **候选与排期归档**：未排期候选放 `candidates/`，按创建顺序编号 `NN-slug.md`；一旦排期，移入 `scheduled/` 并命名为 `vX.Y-NN-slug.md`，同时登记到 `scheduled/README.md` 与下方索引；正式方案正文放 `docs/plan/vX.Y/`。

### 文档组织

| 位置 | 用途 |
|---|---|
| `docs/plan/vX.Y/` | 已排期版本的正式方案、契约、实施记录与验收 |
| `roadmap/candidates/` | 未排期候选，`NN-slug.md`；只写问题、现状、可选方案与风险 |
| `roadmap/scheduled/` | 已排期候选归档，`vX.Y-NN-slug.md`；保留来源方案，方便追溯立项原因 |
| `roadmap/` 根 | 已发布版本总结/发行说明、跨版本专题与索引 |

## 📋 规划中：v2.27 答得可查——行内引用角标、来源定位与回合运行摘要

v2.18 起工具结果就带证据字段、v2.19 起引用带章节与表格坐标、v2.24 又把工具过程收成时间线，但答案本身仍「看不出出处」：正文 `[1]` 不可点、底部角标直接取文档内片段序号（知识从 0 起、网页从 1 起，会出现 `[0]` 与重复编号）、来源平铺不分文档/网页、一轮结束只有 token 用量、抓取失败仍可能反复重试同一地址。v2.27 把这些已有数据接通：装配层统一 `citeIndex`（1 起、与提示词资料块一致），正文角标可点击并定位到来源卡与文档查看器，来源按文档/网页分组并显示类型、坐标、片段与采集时间；补一条回合运行摘要（工具次数、成功/失败、工具耗时、引用条数与来源类型），并让 `fetch_webpage` 连续失败后改用搜索摘要成文而不是重复重试。零迁移，`LATEST_SCHEMA_VERSION` 保持 47；子 Agent handoff 泳道列 P2，不进入验收口径。方案 §2 同时盘点了 v2.10–v2.26 的 26 项未交付点，其余按主题归档为 4 个未排期候选。

- 方案：[v2.27 方案](../plan/v2.27/README.md) · 来源方案：[引用角标、来源定位与回合运行摘要](scheduled/v2.27-01-citation-and-turn-summary.md)
- 状态：📋 规划中（分支 `feat/v2.27-planning`；零迁移，`LATEST_SCHEMA_VERSION` 保持 47）
- 范围：P0 引用编号契约 + 正文角标 + 来源分组定位；P1 回合运行摘要 + 抓取失败降级；P2 handoff 泳道（可选）
- 未排期候选：[记忆图与空闲整理](candidates/01-memory-graph-and-consolidation.md) · [记忆可观测与治理](candidates/02-memory-observability-and-governance.md) · [能力生态与内容包](candidates/03-capability-and-content-pack-completion.md) · [文档质量](candidates/04-document-quality.md)

### 后续版本序列（优先补全遗漏项）

| 顺序 | 版本 | 主题 | 补全的遗漏项 | 成本 |
|---|---|---|---|---|
| 1 | v2.27 | 答得可查：引用角标、来源定位与回合摘要 | v2.24 P1 五项（handoff 泳道列 P2） | 中 |
| 2 | v2.28 | 记忆可管：审计轮转、统计前端与约束撤销 | v2.26 遗留的治理与观测项（候选 02） | 中 |
| 3 | v2.29 | 文档可信：存量重解析与低质输入收口 | v2.19 遗留的旧文档、OCR 与关系抽取（候选 04） | 中高 |
| 4 | v2.30 | 能力补齐：能力目录、审批元数据与内容包更新 | v2.17 / v2.18 外围断点（候选 03） | 中 |
| 5 | 待评估 | 记忆图谱：关系边、社区聚类与空闲整理 | v2.26 图能力（候选 01） | 高 |

排序原则：先做已有数据能直接接通、用户可感知的（引用、回合摘要、统计前端），再做需要新链路或需要人工修正的（重解析、OCR、内容包更新），最后评估成本最高的图能力。每个版本仍保持单一主题、零或一次迁移、Non-Goals 与功能清单同权重。

## ✅ 已正式发布：v2.26 记得久、说得清——双时态记忆、混合召回与上下文分层压缩（2026-11-08，tag `v2.26.0`）

把长期记忆从「抽取 + 向量检索 + 覆盖写入」升级为可追溯、可解释的四条链路。写入侧引入双时态事实（`valid_from / valid_to / superseded_by / version`），新旧值并存、旧行 `superseded`，不再覆盖；回合后先用零模型成本的窄规则识别过敏 / 忌口 / 禁止 / 显式「记住」并实时置顶，常规抽取再交给模型；同一 `subject_key` 冲突由纯函数决定 create / merge / supersede，两侧各写一条审计。召回侧改为向量与 FTS 各取 20 条候选，按 `0.55 / 0.20 / 0.15 / 0.10` 融合，无嵌入时降级为 `0.75 / 0.15 / 0.10`，置顶硬约束每轮最多固定注入 3 条，理由标记 `pinned / hybrid / semantic / keyword`。压缩侧摘要输出结构化 JSON，事实落入 `conversation_facts` 并做数字 / 日期保真校验，注入顺序与 50 / 25 / 10 / 10 预算固定；计划执行时用 `task_checkpoints` 保存工作记忆。生命周期按 `importance × recency × usage` 计算衰减分，30 / 90 / 180 天分档，七天一次只归档不删除，`ttl_at` 到期清理不受间隔限制；新增 `GET /api/memories/stats` 暴露 superseded 比例、零召回率与用户纠正次数。共两次迁移（v046 / v047），`LATEST_SCHEMA_VERSION = 47`；图关系边、空闲整理、审计轮转与统计前端未包含在本版。

- 方案：[v2.26 方案](../plan/v2.26/README.md) · 发行说明：[v2.26-release-notes.md](v2.26-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `42483410458`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.26.0>；安装包 206.44 MB）
- 分支：`feat/v2.26-agent-memory`（PR [#8](https://github.com/flashJJ/workBuddyForMe/pull/8) 合并到 main，merge commit `cac3d295`；tag `v2.26.0` 打在 `cac3d295`；迁移 v046 / v047，`LATEST_SCHEMA_VERSION = 47`）
- 博客：[blog/v2.26](../../blog/v2.26/) 10 篇

## ✅ 已正式发布：v2.24 过程可读、能力可用——工具体验收口与 MCP 能力生态（2026-11-07，tag `v2.24.0`）

对话侧把工具过程做成可读结构：工具轮用尽且正文为空时追加收尾轮再作答；同回合调用聚合为一张可折叠时间线，拆出成功 / 失败 / 被拒绝 / 已熔断四态，并把失败原因归一为超时、限流、鉴权、页面过大、网络等；流式阶段给出搜索 / 阅读 / 检索 / 执行 / 整理五相位；助手消息显示本轮 token；设置保存通过 `BroadcastChannel` 即时同步到桌宠，气泡只保留有意义的整句。能力侧把 MCP 做成可安装的契约：14 个精选服务器分三档，安装前预检 Node / npx / uvx / Chrome，支持目录参数、批量安装、90 秒连接轮询与「启用给助手」；远程 MCP 补 SSE 回包、会话头、协议版本与 401 刷新重试；新增 OAuth 2.1 发现、动态注册、PKCE S256、加密令牌与到期刷新；联网搜索新增 Brave / Tavily 并加密保存 Key。Windows 修复裸 `npx` 被加引号导致 `cmd` 包装解析错误、进程 `code=1` 的问题；全屏舞台把三个 Live2D 角色收进同一 WebGL 上下文，修掉多实例裁剪 FBO 冲突导致只有第一个角色出画的问题，并重做紧凑操作台与省电档。无迁移，`LATEST_SCHEMA_VERSION` 保持 45；方案中排在后一阶段的行内引用、来源卡、handoff 泳道、运行摘要与抓取降级未包含在本版。

- 方案：[v2.24 方案](../plan/v2.24/README.md) · 发行说明：[v2.24-release-notes.md](v2.24-release-notes.md)
- 状态：✅ 已正式发布（tag `v2.24.0`）
- 博客：[blog/v2.24](../../blog/v2.24/) 10 篇

## ✅ 已正式发布：v2.23 质感升级与桌面常驻托盘（2026-11-06，tag `v2.23.0`）

把聊天页从「能用」做到「看起来可靠」：五套主题补齐三级表面、三档阴影与统一动效令牌，组件基元四态齐备；消息流重排为助手无气泡、用户右对齐胶囊，操作条收进 hover/focus 浮层；代码块加语言栏与复制，表格加斑马纹与首列粘性；正文列限宽居中，会话列与形象栏可收起，窄屏阶段条折叠、滚动渐隐；补骨架屏、回到底部浮标与四段式空/错误态，并以全局 `prefers-reduced-motion` 兜底。桌面壳新增常驻托盘（显示/隐藏主窗、桌宠开关、全屏舞台、彻底退出），并修掉开发态图标路径多退一层导致图标静默丢失的旧 bug。无迁移，`LATEST_SCHEMA_VERSION` 保持 45。

- 方案：[v2.23 方案](../plan/v2.23/README.md) · 发行说明：[v2.23-release-notes.md](v2.23-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `42227712390`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.23.0>；安装包 206.19 MB）
- 博客：[blog/v2.23](../../blog/v2.23/) 8 篇

## ✅ 已正式发布：v2.22.2 发布链加固（2026-11-05，tag `v2.22.2`）

把 v2.22.0 事故的同类风险堵在流水线里：desktop 写入 `packageManager` 让包管理器判定不再依赖调用环境；asar 自检递归核对传递依赖与解包原生模块；服务端归集缺件改为硬失败；启动异常弹窗并落盘；Release 流水线补跑 `pnpm check`，失败自动清理草稿。无功能变更、零迁移。

- 发行说明：[v2.22.2-release-notes.md](v2.22.2-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41965821484`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.22.2>；安装包 205.57 MB）
- 承接版本：[v2.22.1 热修复](v2.22.1-release-notes.md) · [v2.22 方案](../plan/v2.22/README.md)

## ✅ 已正式发布：v2.22.1 安装包热修复（2026-11-05，tag `v2.22.1`）

修复 v2.22.0 线上安装包启动即报 `Cannot find module '@nut-tree-fork/nut-js'`：CI 用 `npx electron-builder` 使包管理器被识别为 npm，pnpm hoisted 布局下漏收根级生产依赖。v2.22.1 改用 `pnpm exec electron-builder`，并在发布自检中逐项校验 asar 生产依赖。无功能变更、零迁移。

- 发行说明：[v2.22.1-release-notes.md](v2.22.1-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41894394404`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.22.1>；安装包 205.40 MB）
- 承接版本：[v2.22 方案](../plan/v2.22/README.md)

## ✅ 已正式发布：v2.22 收口——分支会话可靠性与发布闭环（2026-11-04，tag `v2.22.0`）

v2.21.0 发布后审计留下两类缺口：15 行修复只在 main、8 项残余缺口无版本归属。v2.22 不加新主题，只做收口：补丁随 `v2.22.0` 发布、分支事件纳入备份、终态回传补齐、失败重试、运行中预算熔断、实时帧与 `waiting` 语义收口；零迁移，`LATEST_SCHEMA_VERSION` 保持 45。

- 方案：[v2.22 方案](../plan/v2.22/README.md) · [M0 决策](../plan/v2.22/01-M0-决策记录.md)
- 来源方案：[分支会话收口与可靠性加固](scheduled/v2.22-01-branch-hardening.md)
- 发行说明：[v2.22-release-notes.md](v2.22-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41851904951`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.22.0>；CI 质量门禁 / 单测 / API 集成 / Web E2E 全绿；安装包 201.88 MB）
- 分支：`feature/v2.22-planning`（PR [#7](https://github.com/flashJJ/workBuddyForMe/pull/7) 合并到 main，merge commit `4c6d656f`；tag `v2.22.0` 打在 `4c6d656f`；零迁移，`LATEST_SCHEMA_VERSION = 45`）
- 里程碑：M0–M4 全部完成（[01-M0 决策](../plan/v2.22/01-M0-决策记录.md) · [02-M0 契约](../plan/v2.22/02-M0-契约冻结.md) · [03-M1](../plan/v2.22/03-M1-实施记录.md) · [04-M2](../plan/v2.22/04-M2-实施记录.md) · [05-M3](../plan/v2.22/05-M3-实施记录.md) · [06-M4](../plan/v2.22/06-M4-实施记录.md)）

## ✅ 已正式发布：v2.21 会并行——自由分支会话与回传（2026-11-04，tag `v2.21.0`）

v2.20 之后的下一个版本，做用户自由派生的父子会话、结构化回传、四项上限与分支车道；一次 `v045` 迁移；不搬 Pi 会话树/worktree。

- 方案：[v2.21 方案](../plan/v2.21/README.md)
- 来源方案：[自由分支会话与回传](scheduled/v2.21-01-free-branch-sessions.md)
- 发行说明：[v2.21-release-notes.md](v2.21-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41791500288`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.21.0>；单测 3153、Web e2e 141/141、桌面冒烟 10/11；安装包 201.85 MB）
- 分支：`feature/v2.21-planning`（PR [#6](https://github.com/flashJJ/workBuddyForMe/pull/6) 合并到 main，merge commit `08054bc6`；tag `v2.21.0` 打在 `08054bc6`；一次迁移 `v045-conversation-branches`，`LATEST_SCHEMA_VERSION = 45`）
- 里程碑：M0–M4 全部完成（[01-M0 决策](../plan/v2.21/01-M0-决策记录.md) · [02-M0 契约](../plan/v2.21/02-M0-契约冻结.md) · [03-M1](../plan/v2.21/03-M1-实施记录.md) · [04-M2](../plan/v2.21/04-M2-实施记录.md) · [05-M3](../plan/v2.21/05-M3-实施记录.md) · [06-M4](../plan/v2.21/06-M4-实施记录.md)）

## ✅ 已正式发布：v2.20 看得见、分得清——过程图、光线与阶段化会话（2026-11-04，tag `v2.20.0`）

v2.19 把知识输入做深后，下一层断点在运行过程：任务/Flow/协作/会议各自有时间线却互不相连，聊天页看不到全过程，普通会话缺少轻量阶段推进。v2.20 借鉴 Lancer（MIT）：P0 做 RunGraph 五域投影、只读 API、聊天右侧 + `/timeline` 图谱、按设计重写的 Light UI、`meeting` scope；P1 做 1–8 阶段计划、角色卡/助手默认阶段复制、会话级模型切换。一次 `v044` 迁移，不改桌面壳。

- 方案：[v2.20 方案](../plan/v2.20/README.md) · [M0 决策](../plan/v2.20/01-M0-决策记录.md) · [M0 契约](../plan/v2.20/02-M0-契约冻结.md)
- 来源分析：[Lancer 借鉴分析](scheduled/v2.20-01-lancer-borrowing-analysis.md)
- 总结：[v2.20-release-summary.md](v2.20-release-summary.md) · 发行说明：[v2.20-release-notes.md](v2.20-release-notes.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41735043732`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.20.0>；单测 3122、Web e2e 140/140、桌面冒烟 10/11；安装包 200.54 MB）
- 分支：`feature/v2.20-planning`（PR [#5](https://github.com/flashJJ/workBuddyForMe/pull/5) 合并到 main，merge commit `4c3b4c06`；tag `v2.20.0` 打在 `4c3b4c06`；一次迁移 `v044-stage-plan`，`LATEST_SCHEMA_VERSION = 44`）
- 范围：P0 + P1；P2 自由分支转 v2.21

## ✅ 已正式发布：v2.19 📚 看得懂文档——深度解析与可信 RAG（2026-11-03，tag `v2.19.0`）

v2.18 解决了「可交付」；下一层断点在知识输入本身：复杂 PDF 的章节/表格结构丢失、表格被切断、引用只能到页码、RAG 改动缺少质量回归。v2.19 借鉴 RAGFlow（解析/分块）、LightRAG（图检索）、Graphiti（时序关系）、Ragas/Promptfoo（评测）：P0 做结构解析/持久化/结构分块与引用；P1 做表格问答/跨文档对比/结构面板；P2 做实体关系多跳检索、扫描表格增强与评测红队。不引入 Python/Go/Rust 服务，不做会议/屏幕感知。

- 方案：[v2.19 方案](../plan/v2.19/README.md) · [能力借鉴分析](../plan/v2.19/00-能力借鉴分析.md) · [M0 决策](../plan/v2.19/01-M0-决策记录.md) · [M0 契约](../plan/v2.19/02-M0-契约冻结.md) · [M1](../plan/v2.19/03-M1-实施记录.md) · [M2](../plan/v2.19/04-M2-实施记录.md) · [M3](../plan/v2.19/05-M3-实施记录.md) · [M4](../plan/v2.19/06-M4-实施记录.md) · [M5](../plan/v2.19/07-M5-实施记录.md) · [M6 验收](../plan/v2.19/08-M6-验收与发布.md)
- 总结：[v2.19-release-summary.md](v2.19-release-summary.md) · 发行说明：[v2.19-release-notes.md](v2.19-release-notes.md)
- 博客：[blog/v2.19](../../blog/v2.19/) 10 篇
- 来源方案：[深度文档解析与可信 RAG](scheduled/v2.19-01-deep-document-rag.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41496492744`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.19.0>；单测 3067、Web e2e 139/139、桌面冒烟 10/11；安装包 200.32 MB）
- 分支：`feature/v2.19-planning`（PR [#4](https://github.com/flashJJ/workBuddyForMe/pull/4) 合并到 main，merge commit `5f562d2`；tag `v2.19.0` 打在 `5658537`；一次迁移 `v043-document-structure`，`LATEST_SCHEMA_VERSION = 43`）

## ✅ 已正式发布：v2.18 🎨 可交付——图表、内容包与有出处的产物（2026-11-02，tag `v2.18.0`）

v2.17 解决「接得上、搜得到、装得进」后，下一层断点在产出物：模型能写 HTML/Markdown，却没有落盘成文件的工具；内置技能缺少图表设计规范；知识库模板只有空壳；工具结果缺少来源/覆盖率。v2.18 借鉴 Diagram Design（MIT）、HowToLiveBetter（CC BY 4.0）、REA（MIT）、Moli（Apache-2.0）与 ArtCraft（Apache-2.0）：P0 做产物文件管道 + 10 类结构化图表 + Web/桌面 SVG/PNG 导出；P1 做内容包与证据元数据；REA/Moli 只借思路，ArtCraft 本版不移植。不做逆向工程产品、不引入 Rust 浏览器 sidecar、不做生成式创作市场。

- 方案：[v2.18 方案](../plan/v2.18/README.md) · [能力借鉴分析](../plan/v2.18/00-能力借鉴分析.md) · [M6 验收与发布](../plan/v2.18/08-M6-验收与发布.md)
- 来源方案：[可交付产物与内容包](scheduled/v2.18-01-deliverable-artifacts-and-content-packs.md)
- 总结：[v2.18-release-summary.md](v2.18-release-summary.md) · 发行说明：[v2.18-release-notes.md](v2.18-release-notes.md)
- 博客：[blog/v2.18](../../blog/v2.18/) 10 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41403197983`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.18.0>；PR [#3](https://github.com/flashJJ/workBuddyForMe/pull/3)；安装包 194.37 MB）
- 范围：目标零迁移（`LATEST_SCHEMA_VERSION = 42`）；单测 2980、Web e2e 139/139、桌面冒烟 10/11

## ✅ 已正式发布：v2.17 🛰 可连通——厂商能力矩阵与内置联网工具（2026-11-02，tag `v2.17.0`）

v2.16 把目录与入口成本降下来后，下一层断点集中在「接不上、搜不到、装不进」：所有厂商默认假设 `GET /models` 存在；内置工具没有 `web_search`；能力包只能手动上传 ZIP，模型无法自主发现与安装。v2.17 合并两个候选主题：P0 厂商 registry + 多策略模型发现 + 连接测试三态，以及内置 `web_search` + `fetch_webpage`（可插拔搜索后端、来源引用、隐私/审计/限流）；P1 能力目录 + `capability_search` / `capability_install`，经用户审批后安装并在下一轮绑定只读工具。不做远程市场、静默安装、任意代码与协议扩展。

- 方案：[v2.17 方案](../plan/v2.17/README.md)
- 来源方案：[内置联网工具与能力代理](scheduled/v2.17-01-builtin-tools-and-capability-broker.md) · [多厂商兼容](scheduled/v2.17-02-vendor-compat.md)
- 归档索引：[已排期方案](scheduled/README.md) · [未排期候选](candidates/README.md)
- 状态：✅ 已正式发布并置 Latest（Release workflow `41375661027`；main CI `41374622885` / `41375107131` / `41375645579`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.17.0>；生产 Web e2e 139/139、桌面冒烟 10/11；单测 2922；安装包 193.40 MB）
- 分支：`feature/v2.17-planning`（PR [#2](https://github.com/flashJJ/workBuddyForMe/pull/2)，merge commit `1d542d2`；零迁移，`LATEST_SCHEMA_VERSION = 42`）
- 总结：[v2.17-release-summary.md](v2.17-release-summary.md) · 发行说明：[v2.17-release-notes.md](v2.17-release-notes.md) · 验收：[M6](../plan/v2.17/06-M6-验收.md)
- 博客：[blog/v2.17](../../blog/v2.17/) 10 篇

## ✅ 已正式发布：v2.16 🧭 可导航——目录按能力收拢、入口统一、页面少拼装（2026-11-01，tag `v2.16.0`）

v2.15 把日常运维动作补齐后，结构成本成为迭代速度的上限：24 个目录直接文件 ≥20 个、web feature 仅 1/31 有公开入口、91 条跨 feature 深引用、设置页一次挂载约 35 个面板。v2.16 不加功能，只做四件结构性收口：目录按能力分区、每个 feature 暴露纯 re-export 入口、页面用可见区触发查询减少首屏请求、用目录预算 / 跨域边界 / 循环检查把规则固化。不做功能与 API 行为变更、不做数据库迁移、不拆分包。

- 方案：[v2.16 方案](../plan/v2.16/README.md) · [现状取证](../plan/v2.16/00-现状取证.md) · [M0 契约冻结](../plan/v2.16/01-M0-契约冻结.md) · [M0 评审记录](../plan/v2.16/02-M0-评审记录.md) · [M6 验收](../plan/v2.16/08-M6-验收.md)
- 总结：[v2.16-release-summary.md](v2.16-release-summary.md) · 发行说明：[v2.16-release-notes.md](v2.16-release-notes.md)
- 博客：[blog/v2.16](../../blog/v2.16/) 10 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41312037393`、main CI `41312019395`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.16.0>；生产模式 Web e2e 139/139、桌面冒烟 10/11（`computer-input` 环境相关）；单测 2882；安装包 193.34 MB）
- 分支：`feature/v2.16-planning`（`--no-ff` 合入 main `4be4507`；零迁移，`LATEST_SCHEMA_VERSION = 42`）
- 已知偏差：直接文件 ≥20 的目录 24 → 12（目标 ≤10；剩余为 P1 / 豁免 / desktop 主进程，按契约 §1.2「P1 不阻塞」登记，见 [验收 §3](../plan/v2.16/08-M6-验收.md)）

## ✅ 已正式发布：v2.15 ⚙️ 可运营——历史可清理、证据可锚定、凭证可轮换、版本可对比（2026-11-01，tag `v2.15.0`）

v2.14 解决了「出事之后能回退、能定位」，但日常运维仍缺四个动作：技能快照只增不减、审计尾部截断不可检出、凭证没有轮换入口、工作流版本只能人眼比对。v2.15 不加新能力面，只做四件收口：技能快照清理与占用视图、审计归档与外部锚点、Provider 凭证轮换与重封装、工作流版本差异摘要。不做 IM 渠道、多用户、云 Worker、远程市场与 OS 沙箱。

- 方案：[v2.15 方案](../plan/v2.15/README.md) · [现状取证](../plan/v2.15/00-现状取证.md) · [M0 契约冻结](../plan/v2.15/01-M0-契约冻结.md) · [M6 验收](../plan/v2.15/08-M6-验收.md)
- 总结：[v2.15-release-summary.md](v2.15-release-summary.md) · 发行说明：[v2.15-release-notes.md](v2.15-release-notes.md)
- 博客：[blog/v2.15](../../blog/v2.15/) 10 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41222344535`、main CI `41223797037`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.15.0>；生产模式 Web e2e 139/139、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 193.87 MB）
- 分支：`feature/v2.15-planning`（`--no-ff` 合入 main `608e6d8`；零迁移，`LATEST_SCHEMA_VERSION = 42`）

## ✅ 已正式发布：v2.14 🧰 可维护——能升级、能回退、能定位、能对账（2026-10-31，tag `v2.14.0`）

v2.13 把 Agent 治理接通后，v2.12 / v2.13 留下的 P1 欠账集中在「出事之后」：技能与工作流没有可靠回退、能力包不能降级或同版本修复、审计与审批的 `runId` 无法跳到任务时间线、故障时没有脱敏诊断包。v2.14 不加新能力面，只做五件收口：技能版本化与回退、工作流生产版本、能力包降级 / 修复、运行记录下钻、一键诊断包。不做 IM 渠道、多用户、云 Worker、远程市场与 OS 沙箱。

- 方案：[v2.14 方案](../plan/v2.14/README.md) · [现状取证](../plan/v2.14/00-现状取证.md) · [M0 契约冻结](../plan/v2.14/01-M0-契约冻结.md)
- 总结：[v2.14-release-summary.md](v2.14-release-summary.md) · 发行说明：[v2.14-release-notes.md](v2.14-release-notes.md)
- 博客：[blog/v2.14](../../blog/v2.14/) 10 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41190018523`、main CI `41190005610`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.14.0>；生产模式 Web e2e 134/134、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 193.73 MB）
- 分支：`feature/v2.14-planning`（`--no-ff` 合入 main `a49c904`；迁移 v042，`LATEST_SCHEMA_VERSION = 42`）

## ✅ 已正式发布：v2.13 🛡 可治理的 Agent——每次执行都可授权、可约束、可审计（2026-10-31，tag `v2.13.0`）

v2.12 让能力包可信、可升级、可自检；v2.13 把治理对象从「包」推进到「执行」：五档权限模式与工作目录、策略即代码（deny wins）、审批绑定具体操作、追加式哈希链审计账本、定时 Agent 任务与运行历史、隔离网页会话。不做 IM 渠道、多用户、云 Worker 与远程市场。

- 方案：[v2.13 方案](../plan/v2.13/README.md) · [M0 契约冻结](../plan/v2.13/00-M0-契约冻结.md) · [M0 评审记录](../plan/v2.13/01-M0-评审记录.md) · [M1](../plan/v2.13/02-M1-实施记录.md) · [M2](../plan/v2.13/03-M2-实施记录.md) · [M3](../plan/v2.13/04-M3-实施记录.md) · [M4](../plan/v2.13/05-M4-实施记录.md) · [M5](../plan/v2.13/06-M5-实施记录.md) · [M6 验收与发布](../plan/v2.13/07-M6-验收.md)
- 总结：[v2.13-release-summary.md](v2.13-release-summary.md) · 发行说明：[v2.13-release-notes.md](v2.13-release-notes.md)
- 博客：[blog/v2.13](../../blog/v2.13/) 10 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41169841353`、main CI `41169834350`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.13.0>；生产模式 Web e2e 128/128、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 193.61 MB）
- 分支：`feature/v2.13-planning`（`--no-ff` 合入 main `7d5baee`；迁移 v041，`LATEST_SCHEMA_VERSION = 41`）

## ✅ 已正式发布：v2.12 🧩 可扩展 III——能力包收口（签名、升级、健康自检）（2026-10-30，tag `v2.12.0`）

v2.11 把六类 effect 与本地 CLI 外部代理接通，但留下三处收口欠账：清单 `signature` 只记录不验证、同 id 无法升级、包坏了不会自报。v2.12 只做收口：Ed25519 清单签名与本地信任库、同 id 原地升级与失败回滚、按需健康自检与孤儿目录清理；不扩 kind、不加新资源类型、不做远程市场/自动更新。

- 方案：[v2.12 方案](../plan/v2.12/README.md) · [M0 契约冻结](../plan/v2.12/00-M0-契约冻结.md) · [M0 评审记录](../plan/v2.12/01-M0-评审记录.md) · [M1 实施记录](../plan/v2.12/02-M1-实施记录.md) · [M2 实施记录](../plan/v2.12/03-M2-实施记录.md) · [M3 实施记录](../plan/v2.12/04-M3-实施记录.md) · [M4 实施记录](../plan/v2.12/05-M4-实施记录.md) · [M5 验收](../plan/v2.12/06-M5-验收.md)
- 总结：[v2.12-release-summary.md](v2.12-release-summary.md) · 发行说明：[v2.12-release-notes.md](v2.12-release-notes.md)
- 博客：[blog/v2.12](../../blog/v2.12/) 7 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `41034765172`、main CI `41034745290`；Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.12.0>；生产模式 Web e2e 125/125、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 192.62 MB）
- 分支：`feature/v2.12-capability-hardening`（`--no-ff` 合入 main `75e0a7c`；零迁移，schema 仍 v040）

## 已正式发布：v2.11 🧩 可扩展 II——四类 effect 装满，外部代理从缝到实现（2026-10-30，tag `v2.11.0`）

v2.10 只接通了 `skill` / `mcp` 两类 effect，其余 `workflow` / `pet-action` / `event-script` / `report-widget` 在清单层保留但安装拒绝；外部代理只有接口与空注册表。v2.11 把六类 effect 全部接通，并落地第一个外部代理实现（本地 CLI 适配器，默认关、逐次审批、证据可查），守住「不做远程市场、不执行任意代码、不共享宿主密钥」边界。

- 方案：[v2.11 方案](../plan/v2.11/README.md) · [M0 契约冻结](../plan/v2.11/00-M0-契约冻结.md) · [M5 验收](../plan/v2.11/06-M5-验收.md)
- 总结：[v2.11-release-summary.md](v2.11-release-summary.md) · 发行说明：[v2.11-release-notes.md](v2.11-release-notes.md)
- 博客：[blog/v2.11](../../blog/v2.11/) 7 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `40924090724`，Release <https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.11.0>；生产模式 Web e2e 122/122、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 192.49 MB）
- 分支：`feature/v2.11-capabilities-external-agent`（`--no-ff` 合入 main `3c3155d`；跨平台单测修复 `4801b44` + `79c30ff`）

## 已正式发布：v2.7–v2.10 🧭 会汇报、会计划、可复盘、可扩展（2026-10-29，统一 tag `v2.10.0`）

基于 DeepSeek Harness 与 DSH 大肥鱼的对比分析，按「工作状态可见 → 长任务可续 → 全程可复盘 → 能力可扩展」连续交付四个阶段，全部验收后统一发布 `2.10.0`：**v2.7 会汇报**（统一 WorkSignal、桌宠工作态、审批注意力中心）；**v2.8 会计划，也会接着干**（服务端持久作业、目标/计划/待办、定时跟进）；**v2.9 可复盘**（追加式事件日志、全局检索、导出与上下文治理）；**v2.10 可扩展**（能力包与外部代理接口缝）。

- 方案：[v2.7–v2.10 路线](../plan/v2.7-v2.10/README.md) · 总结：[v2.10-release-summary.md](v2.10-release-summary.md)
- 分支：`feature/v2.7-v2.10-work-companion`（`--no-ff` 合入 main `b2e7a6b`）
- 状态：✅ 已正式发布并置 Latest（Release workflow `40812074231`、main CI `40812062412`；全量 Web e2e 120/120（CI 模式 `next start`）、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 `WorkBuddyForMe-Setup-2.10.0.exe` 191.1 MB）
- 阶段验收：[v2.7 M5](../plan/v2.7/05-M5-验收.md) · [v2.8 M5](../plan/v2.8/05-M5-验收.md) · [v2.9 M5](../plan/v2.9/05-M5-验收.md) · [v2.10 M5](../plan/v2.10/05-M5-验收.md)
- 博客：[blog/v2.7](../../blog/v2.7/) 7 篇 · [v2.8](../../blog/v2.8/) 8 篇 · [v2.9](../../blog/v2.9/) 7 篇 · [v2.10](../../blog/v2.10/) 7 篇

## 已正式发布：v2.6 🧠 会沉淀——结论可执行，记忆有来路（2026-10-28，tag `v2.6.0`，2026-10-29 转正）

体验闭环版：**会议结论与行动项**（结束会议生成结构化结论，行动项可转提醒 / Flow）＋**记忆溯源**（对话可见召回内容、来源与理由，记忆面板可回到来源）＋**Electron 45 平台续航**（safeStorage 异步化、沙箱 preload 全局移除）。P1 同时交付**截图粘贴引导**、**运行报告**与**桌面性能基线脚本**。不做图片 / 视频生成、全双工语音、移动端 / 云协作；会议结论调用不启用工具 / MCP / 知识库。

- 方案：[v2.6 会沉淀](../plan/v2.6/README.md) · [M5 收口](../plan/v2.6/05-M5-收口与发布.md)
- 分支：`feature/v2.6-conclusion-memory`
- 博客：[blog/v2.6](../../blog/v2.6/) 7 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `40659351830`；真机 2.5.0→2.6.0 覆盖升级、卸载保留数据 + 重装、旧密文解密通过；Web e2e 112/112、桌面 e2e 11/11；自动更新真实检测留待发布后手动触发）

## 已正式发布：v2.5 🛡 稳固底座——Next 15.5.28 安全升级与 Electron 44 平台换代（2026-10-22，tag `v2.5.0`）

安全与平台底座版，**零新功能、零数据模型变更**。**首要技术项：Next 14.2.35 → 15.5.28**，直接处理安全扫描中的两个 critical RCE（`GHSA-p293-qw3h-jr36` Windows 托管未认证 RCE、`GHSA-2xp9-vwfh-vxw4` Image Optimization AVIF RCE，修复阈值均为 ≥15.5.24），并顺带清掉 Next 全部 23 条公告；同步 React 18.3.1 → 19.3.1。**第二技术项：Electron 31.7.7 → 44.9.3、electron-builder 25.1.8 → 26.18.0、electron-updater 6.8.9 → 6.8.11**，清除 38 条 Electron 公告与构建链 tar / builder-util-runtime 风险；已知硬破坏点为 Electron 44 剪贴板 API 异步化（中文输入走剪贴板粘贴需 await）。打包链路重点验证 Next 15 standalone 的 trace 排除（`outputFileTracingIgnores` 在 15 已移除）与 Windows 安装包/覆盖升级。分支 `feature/v2.5-platform-upgrade`。

- 方案：[v2.5 稳固底座](../plan/v2.5/README.md) · [安全基线与升级矩阵](../plan/v2.5/01-安全基线与升级矩阵.md)
- 博客：[blog/v2.5](../../blog/v2.5/) 6 篇
- 状态：✅ 已正式发布（2026-10-22，tag `v2.5.0`，Release 已转正并置为 Latest；Next/Electron 公告 0；Web e2e 109/109、桌面 e2e 11/11、eval-agent 矩阵全绿；2.4.0 → 2.5.0 自动更新检测通过）

## 已正式发布：v2.4 🚀 装完即用——零配置首启、模板可触达、语音开箱与运行可信（2026-10-22，tag `v2.4.0`）

针对「装完必须先自备 Key 才有第一条回答」的价值兑现缺口，交付五条主线：**零配置首启**（演示模式走真实链路、三来源并列、本机 Ollama 探测置顶、厂商预设、本地小模型引导、`firstAsk` 示例问题、首字自检三档、TTFV ≤60s）；**模板可触达**（15 条模板单一事实源 + 统一 `TemplateGallery` + 五个列表空态/顶部折叠入口 + 逐类「以此开始」语义）；**语音可对话**（双入口一键开启、反应快/更宽容两档、就地下载引导、MeloTTS 默认，纯标点片段三层护栏）；**能力可见性**（`assistants.skill_names` v034 + 卡片/表单/对话页能力摘要）；**运行可信与体感**（三链路 8 个统一结果 + 统一耗时 + 「为什么失败 + 下一步」、协作舞台只读、delta rAF 合帧、长回复分块、首字指标、运行页状态/命令面板/快捷键/三尺寸收口）。`pnpm check` 通过、8 包单测全绿（web 104 文件 / 555 例）、全量 e2e 109 例通过。合并后补两个修复（上游严格 function 名转义、设置页水合失配），`main` CI 全绿；tag `v2.4.0` 触发的 Windows 流水线（run `39728401705`）出包成功，Release 已转正并置为 Latest。安装包 `WorkBuddyForMe-Setup-2.4.0.exe` 139.29 MB。

- 方案：[v2.4 竞品体验对比与改进计划](../plan/v2.4-product-comparison/README.md) · [M0 契约冻结](../plan/v2.4-product-comparison/M0-契约冻结.md) · [P0-1 零配置首启](../plan/v2.4-product-comparison/P0-1-零配置首启/README.md) · [P0-2 模板可触达](../plan/v2.4-product-comparison/P0-2-模板可触达/README.md) · [P0-3 语音可对话](../plan/v2.4-product-comparison/P0-3-语音可对话/README.md)
- 总结：[v2.4-release-summary.md](v2.4-release-summary.md) · 英文发行说明：[v2.4-release-notes-en.md](v2.4-release-notes-en.md)
- 博客：[blog/v2.4](../../blog/v2.4/) 5 篇

## 已并入 v2.4.0 发布：v2.3 🧰 用起来顺手——控件统一、窄窗响应式与开箱即用内容（2026-10，未单独 bump/tag）

体验补课版：把已安装的 Radix Select 组合成组件、`NumberInput` 统一数值输入（空值哨兵、可空语义、受控+失焦提交），26 个文件 / 42 处使用点迁移，裸 `<select>` 与裸 `type="number"` 归零；侧栏 <768px 自动折叠、固定宽改弹性、三尺寸无横向滚动；知识库模板 3 个幂等播种、工作流 starter 3 → 6、MCP 预置目录 4 个 + 一键测试连接、技能「重新扫描」；补 `FormField`、设计 token 文档与三尺寸响应式 E2E。以 `--no-ff` 合入 main（`973a34d`），未 bump 版本号、未打 tag。

- 方案：[v2.3 用起来顺手](../plan/v2.3/README.md) · [现状取证](../plan/v2.3/01-现状取证.md)
- 总结：[v2.3-release-summary.md](v2.3-release-summary.md)
- 博客：[blog/v2.3](../../blog/v2.3/) 4 篇

## 已正式发布：v2.2 🎮 有手感——桌宠反馈升级、交互动画图配置化与事件链接线（2026-10-18，tag `v2.2.0`）

桌宠交互从「扁平反馈」升级为「有形状的反馈」：**动作段模型**（动作条目分 入场 / 循环 / 退场 三段，长按走 A→B 维持、松手走 C 退场）、**状态驱动的待机动作**（动作池按情绪档位与关系等级分组，查找带向下兼容与 Default 兜底）、**拖拽物理与贴边回正**（速度采样 + 惯性滑行 + 双阈值贴边），并补齐双击手势与按手势独立冷却。**交互动画图三阶段**：数据层（`eventTriggerKey` / 条目条件 / 覆盖与停用）→ settings JSON 持久化 + 服务端钳制 → 设置页可视化编辑（内置条目可启用 / 覆盖，自定义条目可增删改）。**事件链接线**：感知 / 系统 / 关系三类事件接进同一条 Resolver 管道（含系统信号源：语音边沿 + 授权后的锁屏 / 唤醒 / 空闲越阈），并给 4 个「可感知且不吵」的非触摸键补默认表现。工程侧：调优面板与 10 个数据驱动面板统一补水合门控（消 React #418/#422）；勿扰时段改为可配置（缺省仍 23:00–06:00）。借鉴开源桌宠模拟器 VPet 的 `AnimatType` 三段式与 `ModeType` 状态兼容查找机制，只取机制不搬实现。**生效口径为「策略通用 + 执行 VRM 优先」**：手势、门控、拖拽物理、分组查找与动画图配置两个后端同时受益；段调度与状态分档先落 3D VRM，2D Live2D 保留现状且 `ControllerLike` 契约零改动。

- 方案：[v2.2 方案](../plan/v2.2/README.md) · [VPet 借鉴分析](../plan/v2.2/01-VPet借鉴分析.md) · [动作段与动画图契约](../plan/v2.2/02-动作段与动画图契约.md)
- 总结：[v2.2-release-summary.md](v2.2-release-summary.md) · 英文发行说明：[v2.2-release-notes-en.md](v2.2-release-notes-en.md)
- 博客：[blog/v2.2](../../blog/v2.2/) 4 篇
- 门禁：`pnpm check`（typecheck 14/14、lint 0 error、行数门禁通过）与 `pnpm test` 8/8 全绿（web 94 文件 / 496 例、shared 314 例、core 1082 例）

## 已正式发布：v2.1 🎬 会动——VRM 待机动作与桌宠交互管道（2026-10-17，tag `v2.1.0`）

形象「会动」版：**待机动作（VRMA）导入**（v032 motion_assets 表 + core motion-service 双校验与落盘 + `/api/motions` 列表/上传/文件流/删除 + 设置页导入向导与列表）→ **动作池**（内置 daiji 常驻 + 全部已导入动作，选中项排首位）→ **定时随机轮播**（3–60s，默认 8s，`motionRotationEnabled` / `motionRotationSeconds`）→ **点击触发一次性动作**（Resolver 动作链新增 `controller.tap`，LoopOnce + mixer finished 回待机）；取景从「单段动画」升级为采样**整个动作池**的包围盒并集（按 clip 时长占比分配采样帧、总帧上限 900）。桌宠交互收口为**归一化 → 纯函数门控（勿扰时段/关系等级/区域冷却）→ ActionExecutor → TriggerBus** 四段式管道。工程侧删死代码、抽 `glb.ts` / `animated-bounds.ts` / 通用导入向导与列表组件，并把本版涨起来的 3 个超 300 行文件与 1 个域 barrel 处理干净（行数门禁违规 4 → 0）。typecheck 14/14、ESLint 0 error、单测 14 包全绿（web 478 / database 93 / core 90 / desktop 45 / shared i18n 35）。总结：[v2.1-release-summary.md](v2.1-release-summary.md)；英文发行说明：[v2.1-release-notes-en.md](v2.1-release-notes-en.md)；博客：[blog/v2.1](../../blog/v2.1/) 4 篇。

## 已正式发布：v2.0 💞 有羁绊——情感闭环、VRM 形象与 mod 生态（2026-10-16，tag v2.0.0）

陪伴化路线收束版，225 文件 +12989/-295（M0–M5）：**关系四档双轴演算**（亲密/信任复合门槛、迟滞与回落地板、kernel 纯函数）驱动**等级事件与解锁闸门**；**六个共同里程碑**（day_1/30/100/365、collab_10/50）只认落库证据，达成走三锁通道播放纪念演出，新增 relationship 长期记忆类别（v029）；**主动感知**仅上报 unlock/lock/idle 边沿、原始信号不落盘，系统事件分组授权默认关；**VRM 第二渲染后端**（three.js 动态 import，与 Live2D 分层）+ 导入向导双校验与免责（v030）；**.wbfm-pack 导入导出**（角色卡/场景/背景图三类白名单、黑名单拒二进制与 eval、VRM 只带引用、builtin 不可覆盖、v031 安装记录）；**关系报告**单文件零外链双语 HTML（五节可选/记忆项可删）；备份 schema v6（events + mod_installs 轨道，五处同步）。typecheck 14/14、单测 14 包全绿、集成 12/12、CI e2e 87/87。总结：[v2.0-release-summary.md](v2.0-release-summary.md)；英文发行说明：[v2.0-release-notes-en.md](v2.0-release-notes-en.md)。

## 未来规划：v1.8–v2.0 🌱 陪伴化路线后半程（2026-10-12 立项调研）

v1.6/v1.7 已交付「有情绪」「有仪式」；后半程：**v1.8 会打扮**（命名主题皮肤 + Markdown 角色卡（文本 mod）+ 配置式模型调优，进行中）→ **v1.9 有舞台**（v1.4 协作可视化演出 + 用户主持的多助手会议舞台）→ **v2.0 活在桌面**（关系养成 × 记忆联动 × 本地主动感知 × `.wbfm-pack` mod 封版，VRM 3D 仅做 go/no-go spike）。贯穿红线：不放开外部 Live2D 模型导入（Cubism 授权）、本地优先、无人值守 desktop 永久禁、弱模型情绪协议确定性回落。

- 总览：[v1.6–v2.0 规划](../plan/v1.6-v2.0/README.md)
- 分析与设计：[Servant 借鉴分析](../plan/v1.6-v2.0/01-Servant借鉴分析.md) · [关键机制深拆](../plan/v1.6-v2.0/02-关键机制深拆.md) · [现状与差距](../plan/v1.6-v2.0/03-现状与差距分析.md) · [版本路线图](../plan/v1.6-v2.0/04-版本路线图.md)
- 分册：[v1.6](../plan/v1.6-v2.0/v1.6-情绪内核与桌宠交互.md) · [v1.7](../plan/v1.6-v2.0/v1.7-事件演出与主动关怀.md) · [v1.8](../plan/v1.6-v2.0/v1.8-皮肤角色卡与模型调优.md) · [v1.9](../plan/v1.6-v2.0/v1.9-多智能体会议舞台.md) · [v2.0](../plan/v1.6-v2.0/v2.0-情感闭环与mod生态.md)
- v1.7 实施冻结稿：[01 step 契约与三锁](../plan/v1.7/01-step契约与三锁状态机.md) · [02 剧本初稿](../plan/v1.7/02-剧本初稿.md) · [03 表结构](../plan/v1.7/03-表结构设计.md)

## 已正式发布：v1.7 💗 有仪式感的陪伴——声明式剧情引擎与角色化提醒（2026-10-14，tag v1.7.0）

v1.6 持久情绪的「时刻」版本，196 文件 +12005/-245（M0–M5 + a11y 热修）：**声明式事件引擎**（8 类白名单 step、FIFO 导演三锁：勿扰 23-8/对话中/冷却×频率系数与每日上限、拒绝原因全落流水）；**8 个内置原创剧本**（早安/晚安/欢迎回家/被夸奖/连摸害羞/生气哄好/任务成败），EventPlayer 复用 v1.6 Live2D/TTS/桌宠运行时，played 后经 emotionOnPlayed 回写 praise/comfort；**角色化提醒**（once/daily/weekly 墙钟+时区双存储，10s tick 先标记后投递，主窗不可见回落系统通知；对话内「提醒我…」零模型本地解析建提醒/缺时间追问/失败回落模型回合）；**自定义短语触发器**（本地包含匹配+时段/冷却/上限/亲密度闸门，v025）；**人格权重 4 列**（v024）；**打扰率统计**（近 30 天接受率/打断率，≥20% 只提示降档）；备份 schema v3 events 轨（助手+提醒+90 天流水+触发器，幂等恢复后提醒重排）。红线：剧本仅 UI 会话演，api/mcp 只入队。typecheck 14/14、单测 322 文件 2007 用例、CI e2e 50/50。总结：[v1.7-release-summary.md](v1.7-release-summary.md)；英文发行说明：[v1.7-release-notes-en.md](v1.7-release-notes-en.md)。

## 已正式发布：v1.6 💗 有情绪的陪伴——跨回合心情状态机与桌宠互动（2026-10-13，tag v1.6.0）

陪伴化路线首版，131 文件 +7034/-206（M0–M5 + 三次封版热修）：每助手持久**心情三变量**（开心/生气/难过，指数惰性衰减）+**关系两变量**（亲密/信任，只增不减）；弱模型安全的**尾块情绪协议**（zod 逐字段回落 + 中文关键词规则保底，尾块在落库/气泡/TTS 三通道剥离，永不影响正文）；**融合表情+余韵**、摸头/连摸保护模式、呼吸/视线等 A 档微动作、**久别迎接**（8h/24h/72h 三档五源触发、跨窗去重、每段缺席最多一次、纯本地不调模型）；情绪面板与独立的互动短句开关；备份新增 emotion 轨。热修：CI 水合死点击挂载门控、引用折叠断言、恢复接口统一信封、侧边栏版本号构建期注入。e2e 46/46；真机 qwen2.5vl:7b 协议 3/3 合法零泄漏。总结：[v1.6-release-summary.md](v1.6-release-summary.md)；英文发行说明：[v1.6-release-notes-en.md](v1.6-release-notes-en.md)。

## 已合 main：v1.4 ✅ 会分工——最小多智能体协作（2026-10-11 封版，tag v1.4.0）

v1.3 知识层封版后的能力版本，主题：**会分工——规划/执行/审查的最小多智能体协作**。固定三角色 Planner/Executor/Reviewer + 结构化 Handoff（v019 agent_runs/agent_handoffs）→ 复用并泛化 task-loop（修复 v0.7 知识检索硬编码断点）→ Flow 新增 agent 节点（确定性 DAG 与概率性子任务同图）→ 角色泳道可观测 + 三重预算硬上限 + 权限不自动提权 → agent eval golden（含去审查者/关知识/限轮次三开关反向验证）。144 文件 +9238/-202；check 14/14、单测 1663、e2e 43/43、eval 四态 33 例全绿。正式方案四篇见 [v1.4 方案](../plan/v1.4/README.md)。

## 已合 main 待发布：v1.3 ✅ 代码已封版并入 main（2026-10，tag/Release 待发布运维）

**主题：知识变厚——编译式 RAG 与知识治理**。v017 chunk 页段坐标 + FTS5（CJK uni-gram）基座；向量/FTS 双路 RRF(k=60) 混合检索与规则重排；无模型知识编译器（实体/别名/文档要点，LLM 增强默认关）+ 编译优先检索路由；语句级页/段/字符引用贯通 UI 与分享；冲突/重复治理与同名替换世代换代；后台编译队列（单并发 FIFO/自动编译/取消/SSE）；P1 七域英文化清零；knowledge eval 15 例三开关反向验证。真机热修：引用随消息持久化（18461de）、v018 chunks_fts 存量回填（13d9b35）。分支 `feature/v1.3-knowledge`（`--no-ff` 合入 main `87a8978`，热修合并 `8df9d9c`）。封版口径：check 14/14、单测 243 文件 1452 用例、e2e 37/37。

- 方案：[v1.3 正式方案](../plan/v1.3/README.md)（四篇）
- 总结：[v1.3-release-summary.md](v1.3-release-summary.md)（M0–M5 交付、踩坑、封版剩余清单）
- 英文发行说明：[v1.3-release-notes-en.md](v1.3-release-notes-en.md)（Release 粘贴版草稿）

## 已发布版本：v1.2 🚧 已出 draft Release，待真机验收后转正（2026-10，tag v1.2.0）

**主题：正式发布打磨**。品牌素材与 NSIS 安装器（许可页/双语/程序组/卸载数据两态）、签名双态（不买证书，有凭据即签/无凭据保留 rcedit）与 Windows 标签发布流水线（draft Release + 产物自检）、深色模式完检（设置表真源/system 三态/语义色/hljs）、a11y pass（skip link/焦点环/命令面板 ARIA/应用内确认框/axe serious-critical=0）、自研零依赖 i18n 与核心路径中英双语（错误码本地化/Intl/导出双语）、首启 4 步向导 + 帮助中心 10 条 FAQ + Ctrl+/ 快捷键浮层。分支 `feature/v1.2-release-polish`（`--no-ff` 合入 main `9956592`）。tag `v1.2.0`。

- 方案：[v1.2 正式发布打磨](../plan/v1.2/README.md)（四篇）
- 总结：[v1.2-release-summary.md](v1.2-release-summary.md)（M0–M5 交付、G1–G10 对账、8 条踩坑、T5.6 封版清单）
- 英文发行说明：[v1.2-release-notes-en.md](v1.2-release-notes-en.md)（Release 粘贴版；真机验收后填日期/sha256 并转正式 Release）

## 已发布版本：v1.1 ✅（2026-10）

**主题：内部加固（零新功能）**。借 elpis（NestJS+LangGraph）的工程资产还 v1.0 的架构债：分层依赖 ESLint 硬门禁（方向 zone + internal 全配对）、工具结果中央压缩层（双视图：模型看压缩/trace 看全文）、热点文件拆分（≥260 文件 28→0）与 barrel 域子路径化（954 成员迁移）、语音运行时下沉 core/voice 独立入口、SSE 契约从 payload 真源机械派生、eval 评估平台化（3 个 golden set 全带反向验证）、覆盖率分级门禁（core 70%+压缩模块 95%、web 关键域 60%）。分支 `feature/v1.1-internal-hardening`（基线 v1.0.0 `b7480e7`，`--no-ff` 合入 main `72794ee`）。tag `v1.1.0`（封版合并 `65e184a`）。

- 方案：[v1.1 内部加固](../plan/v1.1/README.md)（四篇：README/现状差距/重构设计/实施路线与风险，SDD 合同式任务板试点）
- 总结：[v1.1-release-summary.md](v1.1-release-summary.md)（M0–M5 全量交付、全门禁绿；真机抽测另修两个 cipher 热修——同步桥死锁致供应商加载失败、worker fork 炸弹致空闲 OOM 黑屏，均已随 v1.1.0 封入）

## 历史版本

### v1.0 ✅ 已发布（2026-10）

**主题：会说话的桌面伙伴**。本地 sherpa-onnx 语音识别/合成（离线）+ 流式语音对话与可打断 + Live2D 形象（口型/表情）+ 透明置顶鼠标穿透桌宠窗 + 空闲主动搭话。借鉴 Open-LLM-VTuber 并坚持本地优先与半双工安全边界。分支 `feature/v1.0-voice-companion`（`--no-ff` 合入 main，封版合并提交 b7480e7）。tag `v1.0.0`。

- 方案：[docs/plan/v1.0](../plan/v1.0/README.md)（七篇，含 VAD 专题与桌宠专题）
- 总结：[v1.0-release-summary.md](v1.0-release-summary.md)

### v0.9 ✅ 已发布（2026-10）

**主题：执行解耦 + 流程服务化**。队列/事件总线/崩溃恢复、本地 HTTP API、MCP Server（HTTP/stdio 双承载）、无人值守策略门控、运行记录与重放。tag `v0.9.0`。

- 方案：[v0.9-flow-serving.md](v0.9-flow-serving.md)
- 总结：[v0.9-release-summary.md](v0.9-release-summary.md)

### v0.6 ✅ 已发布（2026-09）

**主题：会接活**。MCP 客户端（stdio + HTTP）+ 权限分级与人工确认（HITL）+ 本地声明式技能包 + 工具可观测性/熔断/调试台。tag `v0.6.0`。

- 方案：[v0.6-skills-and-mcp.md](v0.6-skills-and-mcp.md)
- 总结：—

### v0.5 ✅ 已发布（2026-09）

**主题：记得住**。长期记忆（提取/去重/检索注入）+ 上下文工程（token 预算、递归摘要压缩）+ 记忆管理 UI + 评估反馈闭环。tag `v0.5.0`。

- 方案：[v0.5-memory-and-context.md](v0.5-memory-and-context.md)
- 总结：[v0.5-release-summary.md](v0.5-release-summary.md)

### v0.4 ✅ 已发布（2026-09）

**主题：数据随身**。备份恢复（四轨 tar.gz + 合并式恢复）+ 对话分享（Markdown/单文件 HTML + 脱敏）+ 桌面自动更新（electron-updater）+ Ctrl+K 命令面板。tag `v0.4.0`。

- 方案：[v0.4-data-portability-and-updates.md](v0.4-data-portability-and-updates.md)
- 总结：[v0.4-release-summary.md](v0.4-release-summary.md)
- 技术博客：[blog/v0.4](../../blog/v0.4/)（B01 已发布，B02-B10 待续）
- P1 收编：图片型 PDF OCR 兜底（视觉模型优先 + tesseract.js 降级）

### v0.3 ✅ 已发布（2025-Q4）

**主题：什么都能读**。视觉对话 + Office 三格式（docx/xlsx/pptx）解析 + 网页剪藏入库 + 三处真实线上 Bug 复盘修复。tag `v0.3.0`。

- 方案：[v0.3-multimodal-and-rich-docs.md](v0.3-multimodal-and-rich-docs.md)
- 总结：[v0.3-release-summary.md](v0.3-release-summary.md)
- 技术博客：[blog/v0.3](../../blog/v0.3/)（B01-B10，共 10 篇）
- P1 留白：图片型 PDF OCR 兜底延后 v0.4

### v0.2 ✅ 已发布（2025-Q3）

**主题：会动手、能离线**。工具调用链（schema 注册 → LLM tool_calls 解析 → result 回传）+ Ollama 本地模型（OpenAI 兼容接口 + `/api/chat` 原生接口）+ LangSmith 追踪 + 消息重生成 + 知识库增量索引。tag `v0.2`。

- 方案：[v0.2-tool-calling-and-ollama.md](v0.2-tool-calling-and-ollama.md) / [v0.2-execution-plan.md](v0.2-execution-plan.md)
- 总结：[v0.2-release-summary.md](v0.2-release-summary.md)
- 技术博客：[blog/v0.2](../../blog/v0.2/)（B01-B10，共 10 篇）

### v0.1 ✅ 已发布

**主题：闭环**。一个人可用的私人 AI 工作台最小完整闭环。tag `v0.1`。

## 版本索引

| 版本 | 主题 | 状态 | 方案 | 总结 | 博客 | Tag |
|---|---|---|---|---|---|---|
| v0.1 | 闭环：本地 AI 工作台最小可用 | ✅ 已发布 | — | — | — | `v0.1` |
| v0.2 | 会动手、能离线：工具调用 + 本地模型 | ✅ 已发布 | [方案](v0.2-tool-calling-and-ollama.md) | [总结](v0.2-release-summary.md) | 10 篇 | `v0.2` |
| v0.3 | 什么都能读：多模态与富文档 | ✅ 已发布 | [方案](v0.3-multimodal-and-rich-docs.md) | [总结](v0.3-release-summary.md) | 10 篇 | `v0.3.0` |
| v0.4 | 数据随身：备份/分享/自动更新 + OCR + 命令面板 | ✅ 已发布 | [方案](v0.4-data-portability-and-updates.md) | [总结](v0.4-release-summary.md) | B01 起 | `v0.4.0` |
| v0.5 | 记得住：长期记忆 + 上下文工程 | ✅ 已发布 | [方案](v0.5-memory-and-context.md) | [总结](v0.5-release-summary.md) | — | `v0.5.0` |
| v0.6 | 会接活：MCP + 技能包 + 权限确认 | ✅ 已发布 | [方案](v0.6-skills-and-mcp.md) | — | — | `v0.6.0` |
| v0.7 | 看得见、动得了手：桌面 Agent | ✅ 已发布 | [方案](v0.7-computer-agent.md) | — | 10 篇 | `v0.7.0` |
| v0.8 | Flow Studio：可视化工作流 DAG | ✅ 已发布 | [方案](v0.8-flow-studio.md) | [总结](v0.8-release-summary.md) | — | `v0.8.0` |
| v0.9 | Flow Serving：执行解耦 + 本地 API/MCP | ✅ 已发布 | [方案](v0.9-flow-serving.md) | [总结](v0.9-release-summary.md) | B01-B08 | `v0.9.0` |
| v1.0 | 会说话的桌面伙伴：本地语音 + Live2D + 桌宠 | ✅ 已发布（真人验收通过） | [方案](../plan/v1.0/README.md) | [总结](v1.0-release-summary.md) | [blog/v1.0](../../blog/v1.0/) 10 篇 | `v1.0.0` |
| v1.1 | 内部加固：分层强制/工具结果压缩/热点拆分/契约防漂移/eval 平台 | ✅ 已发布（含 cipher 桥死锁/fork 炸弹两个真机热修） | [方案](../plan/v1.1/README.md) | [总结](v1.1-release-summary.md) | [blog/v1.1](../../blog/v1.1/) 10 篇 | `v1.1.0` |
| v1.2 | 正式发布打磨：品牌安装器/签名双态/发布流水线/深色/a11y/i18n/向导帮助 | ✅ 已合 main 并打 tag（真机 T5.6/Release 转正验收中） | [方案](../plan/v1.2/README.md) | [总结](v1.2-release-summary.md) | [blog/v1.2](../../blog/v1.2/) 3 篇 | `v1.2.0` |
| v1.3 | 知识变厚：编译式 RAG 与知识治理（混合检索/重排/语句级引用/治理/eval） | ✅ 已合 main（`8df9d9c`，tag/Release 待发布运维） | [方案](../plan/v1.3/README.md) | [总结](v1.3-release-summary.md) | [blog/v1.3](../../blog/v1.3/) 3 篇 | 待打 |
| v1.4 | 会分工：规划/执行/审查最小多智能体协作（Handoff/agent 节点/泳道/预算/eval） | ✅ 已封版并打 tag v1.4.0（真机抽测后 Release 转正） | [方案](../plan/v1.4/README.md) | [总结](v1.4-release-summary.md) | [blog/v1.4](../../blog/v1.4/) 3 篇 | `v1.4.0` |
| v1.5 | 真机打磨：多库联合检索/弱模型协作收敛/双语系统轨迹/语音与竞态热修 | ✅ 已合 main（版本号 bump/tag/Release 待执行） | — | [总结](v1.5-release-summary.md) | [blog/v1.5](../../blog/v1.5/) 3 篇 | 待打 |
| v1.6 | 有情绪：跨回合心情/关系状态机 + 弱模型安全情绪协议 + 摸头/久别桌宠互动 | ✅ 已正式发布（2026-10-13，真机抽测通过） | [分册](../plan/v1.6-v2.0/v1.6-情绪内核与桌宠交互.md) | [总结](v1.6-release-summary.md) | — | `v1.6.0` |
| v1.7 | 有仪式：声明式剧情引擎（8 剧本+三锁）/角色化提醒/自定义短语/打扰率统计/人格权重 | ✅ 已正式发布（2026-10-14，真机抽测通过） | [分册](../plan/v1.6-v2.0/v1.7-事件演出与主动关怀.md) · [冻结稿](../plan/v1.7/01-step契约与三锁状态机.md) | [总结](v1.7-release-summary.md) | — | `v1.7.0` |
| v2.0 | 有羁绊：关系四档双轴演算/共同里程碑/主动感知边沿信号/VRM 导入与第二渲染后端/.wbfm-pack 生态/关系报告/备份 v6 | ✅ 已正式发布（2026-10-16，真机抽测通过） | [总览](../plan/v2.0/README.md) · [契约](../plan/v2.0/03-关系等级与解锁契约.md) · [mod 规范](../plan/v2.0/04-mod包manifest规范.md) | [总结](v2.0-release-summary.md) | [EN](v2.0-release-notes-en.md) | `v2.0.0` |
| v2.1 | 会动：待机动作导入与动作池轮播、点击触发动作、动作池取景采样、桌宠交互门控管道 | ✅ 已正式发布（2026-10-17，Release 已转正并置为 Latest） | — | [总结](v2.1-release-summary.md) | [EN](v2.1-release-notes-en.md) · [blog/v2.1](../../blog/v2.1/) 4 篇 | `v2.1.0` |
| v2.2 | 有手感：动作段调度（A/B/C）、状态驱动待机、拖拽物理与手势、交互动画图配置化三阶段、事件链接线、水合门控统一 | ✅ 已正式发布（2026-10-18，Release 已转正并置为 Latest） | [方案](../plan/v2.2/README.md) | [总结](v2.2-release-summary.md) | [EN](v2.2-release-notes-en.md) | `v2.2.0` |
| v2.4 | 装完即用：零配置首启、模板可触达、语音开箱、能力可见、运行可信与首字体感 | ✅ 已正式发布（2026-10-22，Release 已转正并置为 Latest） | [方案](../plan/v2.4-product-comparison/README.md) | [总结](v2.4-release-summary.md) | [EN](v2.4-release-notes-en.md) · [blog/v2.4](../../blog/v2.4/) 5 篇 | `v2.4.0` |
| v2.5 | 稳固底座：Next 15.5.28 + React 19 安全升级、Electron 44.9.3/electron-builder 26.18.0 平台换代 | ✅ 已正式发布（2026-10-22，Release 已转正并置为 Latest） | [方案](../plan/v2.5/README.md) · [基线](../plan/v2.5/01-安全基线与升级矩阵.md) | — | — | `v2.5.0` |
| v2.6 | 会沉淀：会议结论/行动项 + 记忆溯源 + Electron 45 平台续航 + 运行报告 | ✅ 已正式发布（2026-10-29，Release 已转正并置 Latest） | [方案](../plan/v2.6/README.md) · [M5](../plan/v2.6/05-M5-收口与发布.md) | [总结](v2.6-release-summary.md) | [EN](v2.6-release-notes-en.md) | `v2.6.0` |
| v2.7 | 会汇报：WorkSignal + 桌宠工作态 + 审批中心 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.7/00-M0-契约冻结.md) · [M5](../plan/v2.7/05-M5-验收.md) | [总结](v2.10-release-summary.md) | [EN](v2.10-release-notes-en.md) | `v2.10.0` |
| v2.8 | 会计划：服务端持久作业 + 目标/计划/待办 + 定时跟进 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.8/00-M0-契约冻结.md) · [M5](../plan/v2.8/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |
| v2.9 | 可复盘：事件日志 + 检索导出 + 大输出溢出 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.9/00-M0-契约冻结.md) · [M5](../plan/v2.9/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |
| v2.10 | 可扩展：能力包 + 外部代理接口缝 | ✅ 已交付（统一发布） | [M0](../plan/v2.10/00-M0-契约冻结.md) · [M5](../plan/v2.10/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |
| v2.11 | 可扩展 II：六类 effect 全接通 + 外部代理（本地 CLI） | ✅ 已正式发布（2026-10-30，Release 已转正并置 Latest） | [M0](../plan/v2.11/00-M0-契约冻结.md) · [M5](../plan/v2.11/06-M5-验收.md) | [总结](v2.11-release-summary.md) | [发行说明](v2.11-release-notes.md) · [blog/v2.11](../../blog/v2.11/) 7 篇 | `v2.11.0` |
| v2.12 | 可扩展 III：能力包签名 / 升级回滚 / 健康自检 | 📐 M4 已完成，待 M5 | [方案](../plan/v2.12/README.md) · [M0](../plan/v2.12/00-M0-契约冻结.md) · [评审](../plan/v2.12/01-M0-评审记录.md) · [M1](../plan/v2.12/02-M1-实施记录.md) · [M2](../plan/v2.12/03-M2-实施记录.md) · [M3](../plan/v2.12/04-M3-实施记录.md) · [M4](../plan/v2.12/05-M4-实施记录.md) | — | — | 待定 |
| v2.16 | 可导航：目录预算、公开入口、可见区请求与结构/循环门禁 | ✅ 已正式发布（2026-11-01，Release 已转正并置 Latest） | [方案](../plan/v2.16/README.md) · [M0](../plan/v2.16/01-M0-契约冻结.md) · [M6](../plan/v2.16/08-M6-验收.md) | [总结](v2.16-release-summary.md) | [发行说明](v2.16-release-notes.md) · [blog/v2.16](../../blog/v2.16/) 10 篇 | `v2.16.0` |
| v2.17 | 可连通：厂商能力矩阵 + 内置联网工具与能力代理 | ✅ 已正式发布（2026-11-02，Release 已转正并置 Latest） | [方案](../plan/v2.17/README.md) · [M0](../plan/v2.17/01-M0-契约冻结.md) · [M1/M2](../plan/v2.17/02-M1-M2-实施记录.md) · [M3](../plan/v2.17/03-M3-实施记录.md) · [M4](../plan/v2.17/04-M4-实施记录.md) · [M5](../plan/v2.17/05-M5-验收.md) · [M6](../plan/v2.17/06-M6-验收.md) | [总结](v2.17-release-summary.md) | [发行说明](v2.17-release-notes.md) | `v2.17.0` |
| v2.18 | 可交付：图表、内容包与有出处的产物 | ✅ 已正式发布（2026-11-02，Release 已转正并置 Latest） | [方案](../plan/v2.18/README.md) · [M0 决策](../plan/v2.18/01-M0-决策记录.md) · [M0 契约](../plan/v2.18/02-M0-契约冻结.md) · [M1](../plan/v2.18/03-M1-实施记录.md) · [M2](../plan/v2.18/04-M2-实施记录.md) · [M3](../plan/v2.18/05-M3-实施记录.md) · [M4](../plan/v2.18/06-M4-实施记录.md) · [M5](../plan/v2.18/07-M5-实施记录.md) · [M6](../plan/v2.18/08-M6-验收与发布.md) | [总结](v2.18-release-summary.md) | [发行说明](v2.18-release-notes.md) | `v2.18.0` |
| v2.19 | 看得懂文档：深度文档解析与可信 RAG | ✅ 已正式发布（2026-11-03，Release 已转正并置 Latest） | [方案](../plan/v2.19/README.md) · [能力借鉴分析](../plan/v2.19/00-能力借鉴分析.md) · [M0 决策](../plan/v2.19/01-M0-决策记录.md) · [M0 契约](../plan/v2.19/02-M0-契约冻结.md) · [M6 验收](../plan/v2.19/08-M6-验收与发布.md) · [来源方案](scheduled/v2.19-01-deep-document-rag.md) | [总结](v2.19-release-summary.md) | [发行说明](v2.19-release-notes.md) | `v2.19.0` |
| v2.20 | 看得见、分得清：过程图、光线与阶段化会话 | ✅ 已正式发布（2026-11-04，Release 已转正并置 Latest） | [方案](../plan/v2.20/README.md) · [M0 决策](../plan/v2.20/01-M0-决策记录.md) · [M0 契约](../plan/v2.20/02-M0-契约冻结.md) · [M1](../plan/v2.20/03-M1-实施记录.md) · [M2](../plan/v2.20/04-M2-实施记录.md) · [M3](../plan/v2.20/05-M3-实施记录.md) · [M4](../plan/v2.20/06-M4-实施记录.md) · [来源分析](scheduled/v2.20-01-lancer-borrowing-analysis.md) | [总结](v2.20-release-summary.md) | [发行说明](v2.20-release-notes.md) · [blog/v2.20](../../blog/v2.20/) 10 篇 | `v2.20.0` |
| v2.21 | 会并行：自由分支会话与回传 | ✅ 已正式发布（2026-11-04，Release 已转正并置 Latest） | [方案](../plan/v2.21/README.md) · [M0 决策](../plan/v2.21/01-M0-决策记录.md) · [M0 契约](../plan/v2.21/02-M0-契约冻结.md) · [M1](../plan/v2.21/03-M1-实施记录.md) · [M2](../plan/v2.21/04-M2-实施记录.md) · [M3](../plan/v2.21/05-M3-实施记录.md) · [M4](../plan/v2.21/06-M4-实施记录.md) · [来源方案](scheduled/v2.21-01-free-branch-sessions.md) | — | [发行说明](v2.21-release-notes.md) · [blog/v2.21](../../blog/v2.21/) 10 篇 | `v2.21.0` |
| v2.22 | 收口：分支事件备份、终态回传、重试、预算熔断与实时帧 | ✅ 已正式发布（2026-11-04，Release 已转正并置 Latest） | [方案](../plan/v2.22/README.md) · [M0 决策](../plan/v2.22/01-M0-决策记录.md) · [M0 契约](../plan/v2.22/02-M0-契约冻结.md) · [M1](../plan/v2.22/03-M1-实施记录.md) · [M2](../plan/v2.22/04-M2-实施记录.md) · [M3](../plan/v2.22/05-M3-实施记录.md) · [M4](../plan/v2.22/06-M4-实施记录.md) · [来源方案](scheduled/v2.22-01-branch-hardening.md) | — | [发行说明](v2.22-release-notes.md) · [blog/v2.22](../../blog/v2.22/) 7 篇 | `v2.22.0` |
| v2.26 | 记得久、说得清：双时态记忆、混合召回与上下文分层压缩 | ✅ 已正式发布（2026-11-08，Release 已转正并置 Latest） | [方案](../plan/v2.26/README.md) | — | [发行说明](v2.26-release-notes.md) · [blog/v2.26](../../blog/v2.26/) 10 篇 | `v2.26.0` |
| v2.27 | 答得可查：行内引用角标、来源定位与回合运行摘要 | 📋 规划中 | [方案](../plan/v2.27/README.md) · [来源方案](scheduled/v2.27-01-citation-and-turn-summary.md) | — | — | 待定 |

## 远期版本展望（粗颗粒，每个版本启动前再细化）

### v0.8+「团队协作」—— 多智能体（✅ 已立项为 v1.4，方案见 [v1.4](../plan/v1.4/README.md)）

- 规划-执行-审查固定三角色（Planner/Executor/Reviewer）首期，结构化 Handoff 交接，不做自由 N 角色群聊
- Agent 成为 Flow 节点：确定性 DAG 与概率性子任务同图；任务分解与交接格式、知识共享与权限边界见 v1.4 方案
- 并行多 Executor、自定义角色市场留 v1.5+ 评估

### v0.9+「知识变厚」—— 编译式 RAG 与知识治理

- 知识编译：文档 → 实体/关系/摘要索引的预编译知识层，检索时静态知识优先、降低延迟
- 可追溯引用升级：语句级绑定原文出处（Source + Page + Paragraph）
- 知识治理：去重、冲突检测、文档版本管理与增量重编译

### v1.0「会说话的桌面伙伴」—— 语音与形象（✅ 已发布，tag v1.0.0）

- 本地 sherpa-onnx ASR/TTS（离线、零费用），流式按句朗读、首逗号快出、停止即打断（半双工）
- Live2D 形象：口型 RMS、表情标签、待机动作；透明置顶桌宠窗（鼠标穿透滞回、拖拽、双击回主窗）
- 详见 [docs/plan/v1.0](../plan/v1.0/README.md) 与 [v1.0-release-summary.md](v1.0-release-summary.md)。原「正式发布」收尾项现移至 v1.2（v1.1 改为内部加固）。

### v1.1「内部加固」—— 代码优化（✅ 已发布，tag v1.1.0）

- 零新功能版本：分层依赖 ESLint 硬门禁、工具结果中央压缩（双视图）、热点文件拆分去白名单、barrel 域子路径化、SSE 契约机械派生、eval 平台化、覆盖率分级门禁
- 详见 [docs/plan/v1.1](../plan/v1.1/README.md) 与 [v1.1-release-summary.md](v1.1-release-summary.md)。借 elpis 的纯函数压缩器、internal 目录约定与合同式 SDD，不迁 NestJS DI

### v1.2「正式发布」—— 可对外分发（✅ 已合 main，tag v1.2.0，真机验收中）

- Windows 品牌安装器与签名双态（不买证书）、标签发布流水线（draft Release）
- 深色模式完检、a11y pass、自研 i18n 中英双语、首启向导/帮助中心/快捷键浮层
- 详见 [v1.2-release-summary.md](v1.2-release-summary.md)。代码签名证书采购仍待决策（接入位已就位）

### v1.3「知识变厚」—— 编译式 RAG（✅ 已合 main，见上）

- 已交付：编译式 RAG（实体/要点预编译）+ 混合检索重排 + 语句级页段引用 + 知识治理 + 后台编译队列
- 详见 [v1.3 方案](../plan/v1.3/README.md) 与 [v1.3-release-summary.md](v1.3-release-summary.md)

### v1.4「会分工」—— 最小多智能体协作（📐 规划中）

- 固定 Planner/Executor/Reviewer 三角色 + 结构化 Handoff；Agent 成 Flow 节点；三重预算与权限不放松
- 详见 [v1.4 规划提案](../plan/v1.4/README.md)（候选对比、推荐理由、待决策清单），评审通过后进入 M0–M5 实施

## 版本方案文档标准结构

后续版本方案统一按此结构撰写，保证可评审、可回溯：

1. **版本主题与目标**（一句话价值主张 + 成功指标）
2. **现状与痛点**（基于上一版本真实使用反馈）
3. **功能清单**（P0 必做 / P1 争取 / P2 留白，每条含用户故事、验收标准、技术要点、工作量）
4. **架构影响**（改动哪些包、数据模型迁移、接口变更）
5. **里程碑拆分**（可独立验收的垂直切片）
6. **风险与取舍**
7. **Non-Goals（本版本明确不做）**
