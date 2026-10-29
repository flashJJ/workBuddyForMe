# 产品路线图与版本迭代方案

> 本文件夹是 WorkBuddy For Me **版本迭代方案的唯一归档处**。
> 每个版本一份方案文档，命名格式 `v版本号-主题-slug.md`；发布后在下方索引表登记结论。

## 规划原则

1. **一个版本一个主题**：不贪多，主题内做到闭环可用，拒绝半成品功能堆积。
2. **本地优先不动摇**：数据留在本机、无强制云服务、密钥不出本机——所有版本必须遵守的宪法。
3. **先疼后美**：优先解决「用起来单调/缺失」的能力断点，再做体验美化。
4. **延续工程宪法**：TS strict、单文件 ≤300 行、外部调用测试 mock、四层测试不降级。
5. **方案先于编码**：版本开工前方案必须经过取舍评审（Non-Goals 与功能清单同等重要）。

## 规划中：v2.11 🧩 可扩展 II——四类 effect 装满，外部代理从缝到实现

v2.10 只接通了 `skill` / `mcp` 两类 effect，其余 `workflow` / `pet-action` / `event-script` / `report-widget` 在清单层保留但安装拒绝；外部代理只有接口与空注册表。v2.11 把六类 effect 全部接通，并落地第一个外部代理实现（本地 CLI 适配器，默认关、逐次审批、证据可查），守住「不做远程市场、不执行任意代码、不共享宿主密钥」边界。

- 方案：[v2.11 方案](../plan/v2.11/README.md) · [M0 契约冻结](../plan/v2.11/00-M0-契约冻结.md)
- 状态：⏳ M0 冻结稿已产出（待评审）
- 分支：`docs/v2.11-roadmap`

## 已正式发布：v2.6 🧠 会沉淀——结论可执行，记忆有来路（2026-10-28，tag `v2.6.0`，2026-10-29 转正）

体验闭环版：**会议结论与行动项**（结束会议生成结构化结论，行动项可转提醒 / Flow）＋**记忆溯源**（对话可见召回内容、来源与理由，记忆面板可回到来源）＋**Electron 45 平台续航**（safeStorage 异步化、沙箱 preload 全局移除）。P1 同时交付**截图粘贴引导**、**运行报告**与**桌面性能基线脚本**。不做图片 / 视频生成、全双工语音、移动端 / 云协作；会议结论调用不启用工具 / MCP / 知识库。

- 方案：[v2.6 会沉淀](../plan/v2.6/README.md) · [M5 收口](../plan/v2.6/05-M5-收口与发布.md)
- 分支：`feature/v2.6-conclusion-memory`
- 博客：[blog/v2.6](../../blog/v2.6/) 7 篇
- 状态：✅ 已正式发布并置 Latest（Release workflow `40659351830`；真机 2.5.0→2.6.0 覆盖升级、卸载保留数据 + 重装、旧密文解密通过；Web e2e 112/112、桌面 e2e 11/11；自动更新真实检测留待发布后手动触发）

## 已正式发布：v2.7–v2.10 🧭 会汇报、会计划、可复盘、可扩展（2026-10-29，统一 tag `v2.10.0`）

基于 DeepSeek Harness 与 DSH 大肥鱼的对比分析，按「工作状态可见 → 长任务可续 → 全程可复盘 → 能力可扩展」连续交付四个阶段，全部验收后统一发布 `2.10.0`：**v2.7 会汇报**（统一 WorkSignal、桌宠工作态、审批注意力中心）；**v2.8 会计划，也会接着干**（服务端持久作业、目标/计划/待办、定时跟进）；**v2.9 可复盘**（追加式事件日志、全局检索、导出与上下文治理）；**v2.10 可扩展**（能力包与外部代理接口缝）。

- 方案：[v2.7–v2.10 路线](../plan/v2.7-v2.10/README.md) · 总结：[v2.10-release-summary.md](v2.10-release-summary.md)
- 分支：`feature/v2.7-v2.10-work-companion`（`--no-ff` 合入 main `b2e7a6b`）
- 状态：✅ 已正式发布并置 Latest（Release workflow `40812074231`、main CI `40812062412`；全量 Web e2e 120/120（CI 模式 `next start`）、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 `WorkBuddyForMe-Setup-2.10.0.exe` 191.1 MB）
- 阶段验收：[v2.7 M5](../plan/v2.7/05-M5-验收.md) · [v2.8 M5](../plan/v2.8/05-M5-验收.md) · [v2.9 M5](../plan/v2.9/05-M5-验收.md) · [v2.10 M5](../plan/v2.10/05-M5-验收.md)
- 博客：[blog/v2.7](../../blog/v2.7/) 7 篇 · [v2.8](../../blog/v2.8/) 8 篇 · [v2.9](../../blog/v2.9/) 7 篇 · [v2.10](../../blog/v2.10/) 7 篇

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
| v2.4 | 装完即用：零配置首启、模板可触达、语音开箱、能力可见、运行可信与首字体感 | ✅ 已正式发布（2026-10-22，Release 已转正并置为 Latest） | [方案](../plan/v2.4-product-comparison/README.md) | [总结](v2.4-release-summary.md) | [EN](v2.4-release-notes-en.md) · [blog/v2.4](../../blog/v2.4/) 5 篇 | `v2.4.0` |
| v2.5 | 稳固底座：Next 15.5.28 + React 19 安全升级、Electron 44.9.3/electron-builder 26.18.0 平台换代 | ✅ 已正式发布（2026-10-22，Release 已转正并置为 Latest） | [方案](../plan/v2.5/README.md) · [基线](../plan/v2.5/01-安全基线与升级矩阵.md) | — | — | `v2.5.0` |
| v2.6 | 会沉淀：会议结论/行动项 + 记忆溯源 + Electron 45 平台续航 + 运行报告 | ✅ 已正式发布（2026-10-29，Release 已转正并置 Latest） | [方案](../plan/v2.6/README.md) · [M5](../plan/v2.6/05-M5-收口与发布.md) | [总结](v2.6-release-summary.md) | [EN](v2.6-release-notes-en.md) | `v2.6.0` |
| v2.7 | 会汇报：WorkSignal + 桌宠工作态 + 审批中心 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.7/00-M0-契约冻结.md) · [M5](../plan/v2.7/05-M5-验收.md) | [总结](v2.10-release-summary.md) | [EN](v2.10-release-notes-en.md) | `v2.10.0` |
| v2.8 | 会计划：服务端持久作业 + 目标/计划/待办 + 定时跟进 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.8/00-M0-契约冻结.md) · [M5](../plan/v2.8/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |
| v2.9 | 可复盘：事件日志 + 检索导出 + 大输出溢出 | ✅ 已交付（并入 v2.10.0 统一发布） | [M0](../plan/v2.9/00-M0-契约冻结.md) · [M5](../plan/v2.9/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |
| v2.10 | 可扩展：能力包 + 外部代理接口缝 | ✅ 已交付（统一发布） | [M0](../plan/v2.10/00-M0-契约冻结.md) · [M5](../plan/v2.10/05-M5-验收.md) | 同上 | 同上 | `v2.10.0` |

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
