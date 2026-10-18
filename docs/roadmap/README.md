# 产品路线图与版本迭代方案

> 本文件夹是 WorkBuddy For Me **版本迭代方案的唯一归档处**。
> 每个版本一份方案文档，命名格式 `v版本号-主题-slug.md`；发布后在下方索引表登记结论。

## 规划原则

1. **一个版本一个主题**：不贪多，主题内做到闭环可用，拒绝半成品功能堆积。
2. **本地优先不动摇**：数据留在本机、无强制云服务、密钥不出本机——所有版本必须遵守的宪法。
3. **先疼后美**：优先解决「用起来单调/缺失」的能力断点，再做体验美化。
4. **延续工程宪法**：TS strict、单文件 ≤300 行、外部调用测试 mock、四层测试不降级。
5. **方案先于编码**：版本开工前方案必须经过取舍评审（Non-Goals 与功能清单同等重要）。

## 已正式发布：v2.2 🎮 有手感——桌宠反馈升级、交互动画图配置化与事件链接线（2026-10-18，tag `v2.2.0`）

桌宠交互从「扁平反馈」升级为「有形状的反馈」：**动作段模型**（动作条目分 入场 / 循环 / 退场 三段，长按走 A→B 维持、松手走 C 退场）、**状态驱动的待机动作**（动作池按情绪档位与关系等级分组，查找带向下兼容与 Default 兜底）、**拖拽物理与贴边回正**（速度采样 + 惯性滑行 + 双阈值贴边），并补齐双击手势与按手势独立冷却。**交互动画图三阶段**：数据层（`eventTriggerKey` / 条目条件 / 覆盖与停用）→ settings JSON 持久化 + 服务端钳制 → 设置页可视化编辑（内置条目可启用 / 覆盖，自定义条目可增删改）。**事件链接线**：感知 / 系统 / 关系三类事件接进同一条 Resolver 管道（含系统信号源：语音边沿 + 授权后的锁屏 / 唤醒 / 空闲越阈），并给 4 个「可感知且不吵」的非触摸键补默认表现。工程侧：调优面板与 10 个数据驱动面板统一补水合门控（消 React #418/#422）；勿扰时段改为可配置（缺省仍 23:00–06:00）。借鉴开源桌宠模拟器 VPet 的 `AnimatType` 三段式与 `ModeType` 状态兼容查找机制，只取机制不搬实现。**生效口径为「策略通用 + 执行 VRM 优先」**：手势、门控、拖拽物理、分组查找与动画图配置两个后端同时受益；段调度与状态分档先落 3D VRM，2D Live2D 保留现状且 `ControllerLike` 契约零改动。

- 方案：[v2.2 方案](../plan/v2.2/README.md) · [VPet 借鉴分析](../plan/v2.2/01-VPet借鉴分析.md) · [动作段与动画图契约](../plan/v2.2/02-动作段与动画图契约.md)
- 总结：[v2.2-release-summary.md](v2.2-release-summary.md) · 英文发行说明：[v2.2-release-notes-en.md](v2.2-release-notes-en.md)
- 门禁：`pnpm check`（typecheck 14/14、lint 0 error、行数门禁通过）与 `pnpm test` 8/8 全绿（web 94 文件 / 496 例、shared 314 例、core 1082 例）

## 已正式发布：v2.1 🎬 会动——VRM 待机动作与桌宠交互管道（2026-10-17，tag `v2.1.0`）

形象「会动」版：**待机动作（VRMA）导入**（v032 motion_assets 表 + core motion-service 双校验与落盘 + `/api/motions` 列表/上传/文件流/删除 + 设置页导入向导与列表）→ **动作池**（内置 daiji 常驻 + 全部已导入动作，选中项排首位）→ **定时随机轮播**（3–60s，默认 8s，`motionRotationEnabled` / `motionRotationSeconds`）→ **点击触发一次性动作**（Resolver 动作链新增 `controller.tap`，LoopOnce + mixer finished 回待机）；取景从「单段动画」升级为采样**整个动作池**的包围盒并集（按 clip 时长占比分配采样帧、总帧上限 900）。桌宠交互收口为**归一化 → 纯函数门控（勿扰时段/关系等级/区域冷却）→ ActionExecutor → TriggerBus** 四段式管道。工程侧删死代码、抽 `glb.ts` / `animated-bounds.ts` / 通用导入向导与列表组件，并把本版涨起来的 3 个超 300 行文件与 1 个域 barrel 处理干净（行数门禁违规 4 → 0）。typecheck 14/14、ESLint 0 error、单测 14 包全绿（web 478 / database 93 / core 90 / desktop 45 / shared i18n 35）。总结：[v2.1-release-summary.md](v2.1-release-summary.md)；英文发行说明：[v2.1-release-notes-en.md](v2.1-release-notes-en.md)；博客：[blog/v2.1](../../blog/v2.1/) 4 篇。

## 已正式发布：v2.0 💞 有羁绊——情感闭环、VRM 形象与 mod 生态（2026-10-16，tag v2.0.0）

陪伴化路线收束版，225 文件 +12989/-295（M0–M5）：**关系四档双轴演算**（亲密/信任复合门槛、迟滞与回落地板、kernel 纯函数）驱动**等级事件与解锁闸门**；**六个共同里程碑**（day_1/30/100/365、collab_10/50）只认落库证据，达成走三锁通道播放纪念演出，新增 relationship 长期记忆类别（v029）；**主动感知**仅上报 unlock/lock/idle 边沿、原始信号不落盘，系统事件分组授权默认关；**VRM 第二渲染后端**（three.js 动态 import，与 Live2D 分层）+ 导入向导双校验与免责（v030）；**.wbfm-pack 导入导出**（角色卡/场景/背景图三类白名单、黑名单拒二进制与 eval、VRM 只带引用、builtin 不可覆盖、v031 安装记录）；**关系报告**单文件零外链双语 HTML（五节可选/记忆项可删）；备份 schema v6（events + mod_installs 轨道，五处同步）。typecheck 14/14、单测 14 包全绿、集成 12/12、CI e2e 87/87。总结：[v2.0-release-summary.md](v2.0-release-summary.md)；英文发行说明：[v2.0-release-notes-en.md](v2.0-release-notes-en.md)。

## 已正式发布：v1.7 💗 有仪式感的陪伴——声明式剧情引擎与角色化提醒（2026-10-14，tag v1.7.0）

v1.6 持久情绪的「时刻」版本，196 文件 +12005/-245（M0–M5 + a11y 热修）：**声明式事件引擎**（8 类白名单 step、FIFO 导演三锁：勿扰 23-8/对话中/冷却×频率系数与每日上限、拒绝原因全落流水）；**8 个内置原创剧本**（早安/晚安/欢迎回家/被夸奖/连摸害羞/生气哄好/任务成败），EventPlayer 复用 v1.6 Live2D/TTS/桌宠运行时，played 后经 emotionOnPlayed 回写 praise/comfort；**角色化提醒**（once/daily/weekly 墙钟+时区双存储，10s tick 先标记后投递，主窗不可见回落系统通知；对话内「提醒我…」零模型本地解析建提醒/缺时间追问/失败回落模型回合）；**自定义短语触发器**（本地包含匹配+时段/冷却/上限/亲密度闸门，v025）；**人格权重 4 列**（v024）；**打扰率统计**（近 30 天接受率/打断率，≥20% 只提示降档）；备份 schema v3 events 轨（助手+提醒+90 天流水+触发器，幂等恢复后提醒重排）。红线：剧本仅 UI 会话演，api/mcp 只入队。typecheck 14/14、单测 322 文件 2007 用例、CI e2e 50/50。总结：[v1.7-release-summary.md](v1.7-release-summary.md)；英文发行说明：[v1.7-release-notes-en.md](v1.7-release-notes-en.md)。

## 已正式发布：v1.6 💗 有情绪的陪伴——跨回合心情状态机与桌宠互动（2026-10-13，tag v1.6.0）

陪伴化路线首版，131 文件 +7034/-206（M0–M5 + 三次封版热修）：每助手持久**心情三变量**（开心/生气/难过，指数惰性衰减）+**关系两变量**（亲密/信任，只增不减）；弱模型安全的**尾块情绪协议**（zod 逐字段回落 + 中文关键词规则保底，尾块在落库/气泡/TTS 三通道剥离，永不影响正文）；**融合表情+余韵**、摸头/连摸保护模式、呼吸/视线等 A 档微动作、**久别迎接**（8h/24h/72h 三档五源触发、跨窗去重、每段缺席最多一次、纯本地不调模型）；情绪面板与独立的互动短句开关；备份新增 emotion 轨。热修：CI 水合死点击挂载门控、引用折叠断言、恢复接口统一信封、侧边栏版本号构建期注入。e2e 46/46；真机 qwen2.5vl:7b 协议 3/3 合法零泄漏。总结：[v1.6-release-summary.md](v1.6-release-summary.md)；英文发行说明：[v1.6-release-notes-en.md](v1.6-release-notes-en.md)。

## 未来规划：v1.8–v2.0 🌱 陪伴化路线后半程（2026-10-12 立项调研）

v1.6/v1.7 已交付「有情绪」「有仪式」；后半程：**v1.8 会打扮**（命名主题皮肤 + Markdown 角色卡（文本 mod）+ 配置式模型调优，进行中）→ **v1.9 有舞台**（v1.4 协作可视化演出 + 用户主持的多助手会议舞台）→ **v2.0 活在桌面**（关系养成 × 记忆联动 × 本地主动感知 × `.wbfm-pack` mod 封版，VRM 3D 仅做 go/no-go spike）。贯穿红线：不放开外部 Live2D 模型导入（Cubism 授权）、本地优先、无人值守 desktop 永久禁、弱模型情绪协议确定性回落。

- 总览：[v1.6–v2.0 规划](../plan/v1.6-v2.0/README.md)
- 分析与设计：[Servant 借鉴分析](../plan/v1.6-v2.0/01-Servant借鉴分析.md) · [关键机制深拆](../plan/v1.6-v2.0/02-关键机制深拆.md) · [现状与差距](../plan/v1.6-v2.0/03-现状与差距分析.md) · [版本路线图](../plan/v1.6-v2.0/04-版本路线图.md)
- 分册：[v1.6](../plan/v1.6-v2.0/v1.6-情绪内核与桌宠交互.md) · [v1.7](../plan/v1.6-v2.0/v1.7-事件演出与主动关怀.md) · [v1.8](../plan/v1.6-v2.0/v1.8-皮肤角色卡与模型调优.md) · [v1.9](../plan/v1.6-v2.0/v1.9-多智能体会议舞台.md) · [v2.0](../plan/v1.6-v2.0/v2.0-情感闭环与mod生态.md)
- v1.7 实施冻结稿：[01 step 契约与三锁](../plan/v1.7/01-step契约与三锁状态机.md) · [02 剧本初稿](../plan/v1.7/02-剧本初稿.md) · [03 表结构](../plan/v1.7/03-表结构设计.md)

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
