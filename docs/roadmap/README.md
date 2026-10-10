# 产品路线图与版本迭代方案

> 本文件夹是 WorkBuddy For Me **版本迭代方案的唯一归档处**。
> 每个版本一份方案文档，命名格式 `v版本号-主题-slug.md`；发布后在下方索引表登记结论。

## 规划原则

1. **一个版本一个主题**：不贪多，主题内做到闭环可用，拒绝半成品功能堆积。
2. **本地优先不动摇**：数据留在本机、无强制云服务、密钥不出本机——所有版本必须遵守的宪法。
3. **先疼后美**：优先解决「用起来单调/缺失」的能力断点，再做体验美化。
4. **延续工程宪法**：TS strict、单文件 ≤300 行、外部调用测试 mock、四层测试不降级。
5. **方案先于编码**：版本开工前方案必须经过取舍评审（Non-Goals 与功能清单同等重要）。

## 当前版本：v1.4 📐 正式方案已产出（A 方案，待评审开工）

v1.3 知识层封版后的能力版本，主题已定：**A. 会分工——规划/执行/审查的最小多智能体协作**（2026-10-11 拍板，B 活知识/C 桌面可靠性/D 生态模板留后续评估）。开工前置：v1.3.0 已合 main（合并节点 `8df9d9c`，含真机热修；tag/Release 转正为发布运维并行项）。正式方案四篇见 [v1.4 方案](../plan/v1.4/README.md)：固定三角色 Planner/Executor/Reviewer + 结构化 Handoff（v019 agent_runs/agent_handoffs）→ 复用并泛化 task-loop（修复 v0.7 知识检索硬编码断点）→ Flow 新增 agent 节点（确定性 DAG 与概率性子任务同图）→ 角色泳道可观测 + 三重预算硬上限 + 权限不自动提权 → agent eval golden（含去审查者/关知识/限轮次三开关反向验证），M0–M5 合同任务板待评审。

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
| v1.2 | 正式发布打磨：品牌安装器/签名双态/发布流水线/深色/a11y/i18n/向导帮助 | ✅ 已合 main 并打 tag（真机 T5.6/Release 转正验收中） | [方案](../plan/v1.2/README.md) | [总结](v1.2-release-summary.md) | — | `v1.2.0` |
| v1.3 | 知识变厚：编译式 RAG 与知识治理（混合检索/重排/语句级引用/治理/eval） | ✅ 已合 main（`8df9d9c`，tag/Release 待发布运维） | [方案](../plan/v1.3/README.md) | [总结](v1.3-release-summary.md) | — | 待打 |
| v1.4 | 会分工：规划/执行/审查最小多智能体协作（Handoff/agent 节点/泳道/预算/eval） | 📐 方案已产出待评审（分支 `feature/v1.4-planning`） | [方案](../plan/v1.4/README.md) | — | — | — |

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
