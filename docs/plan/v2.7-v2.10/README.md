# v2.7–v2.10 下一阶段路线：会汇报、会计划、可复盘、可扩展

> 状态：进行中（2026-10-29，按 v2.7 → v2.8 → v2.9 → v2.10 顺序开发；四个阶段全部验收后统一发布，不逐版发布）
> 进度：v2.7 ✅（[M5](../v2.7/05-M5-验收.md)）· v2.8 ✅（[M5](../v2.8/05-M5-验收.md)）· v2.9 ✅（[M5](../v2.9/05-M5-验收.md)）· v2.10 待开发
> 结论：先补「工作状态可见 + 审批注意力」，再补「长任务持久化 + 计划/待办」，然后做「事件日志与复盘」，最后才评估「能力包与外部代理」。
> 本文只定义版本主题、边界与验收口径；每个版本开工前仍需 M0 契约冻结。

## 1. 参考项目拆解

### 1.1 DeepSeek Harness（dsh）：把 Agent 运行时拆成可替换能力

dsh 的核心不是某个功能，而是一套运行时纪律：

- **三类事件**：durable session events（落库、可重放、决定模型历史）、live agent events（inbox/step/status/request/continuation，用于观察与拦截在途工作）、capability events（fs/tools/telemetry 等策略接缝）。见 `docs/architecture.md` 的 Events 与 Turn flow。
- **模型可见即落库**：每个模型请求都必须能从会话日志重建；新增模型可见输入必须先有 session event。投影层（session projection）从事件折叠出 UI 视图，而不是让 UI 自己维护状态。
- **能力缝（capability seam）**：Service Definition / Service Provider / Consumer 三角色；换文件系统、子进程、沙箱、子代理提供方时，消费者不变。
- **长任务原语分层**：subagent（一次性/可续聊/跨进程子代理）、jobs（owner-fenced 后台作业，完成回投 owning agent）、workflow（确定性流程）、schedule（宿主拥有的定时跟进）、goal（会话目标）、plan（计划协作与评审退出）、todo（模型维护的待办）。
- **上下文治理**：compaction（压缩）、spill（大工具输出溢出到存储）、attachment（内容寻址附件）、session-query（跨会话检索与导出，SQLite FTS5）。
- **人机协作**：approval 一次性允许/拒绝且 fail-closed、permission presets、ask_user_question、slash commands。
- **插件化分发**：profile + bundle + patch 层，所有能力可挂载/卸载；注册即 effect，卸载自动回滚。见 `docs/architecture.md` 的 Profiles and bundles。
- **安全边界**：沙箱、审批策略、凭据服务、ACP 自动化审批各自闭环。

**值得借鉴**：事件分层与「模型可见即落库」、投影缝、能力缝、后台作业归属、子代理可续聊、计划/目标/待办分离、会话检索与导出、审批 fail-closed。
**不建议照搬**：全套 Cordis「一切皆插件」、profile/bundle/patch 分发体系、跨平台 SDK/ACP、复杂沙箱后端、会话格式多代迁移。它们服务于「一个 harness 供多客户端/多代理」，而 WorkBuddyForMe 是「一个本地优先的陪伴产品」，照搬会把产品复杂度推给用户。

### 1.2 DSH 大肥鱼：把运行时状态翻译成桌宠语言

大肥鱼的价值不在动画素材，而在**状态翻译**：

- **状态集合克制**：`IDLE / THINKING / WORKING / WAITING / SUCCESS / ERROR / DISCONNECTED` 七态，足够覆盖任务生命周期。
- **状态来自真实会话事件**，不读屏幕；气泡展示项目、步骤、多任务、待办进度与子 Agent，不伪造上游没有的信息。
- **优先级与衔接明确**：拖拽/落地保护当前鼠标动作；工作、等待、错误立即打断待机/点击动作；完成/错误提示接管装饰动作；同一视频连续帧不叠加淡入淡出；不同动作 100ms 淡化；拖拽切换直接绘制。
- **节奏可配置**：安静/标准/活泼三档决定待机动作后的休息间隔（45–90 / 25–45 / 12–22 秒）；「减少动态」固定姿势并关闭随机待机/点击动画。
- **动作完整播完再回状态**：点击动作、完成庆祝、错误叹气都按源视频完整播放，再回到最新任务状态；新任务可立即打断装饰动作。
- **提示音分场景**：完成/工具出错/等待审批分别开关；macOS 同时控制通知横幅，Windows/Linux 只播放声音。
- **窗口细节**：透明、无边框、始终置顶、跨显示器拖动、点击穿透、气泡在顶部空间不足时翻到角色下方；平台 Helper 有明确降级与诊断日志。
- **设置实时生效**：角色大小、气泡大小、活动节奏、减少动态、提示音、气泡显示、子 Agent、页面内角色、打开目标、余额来源；右键菜单提供单次运行级操作。

**值得借鉴**：七态模型、真实事件驱动、优先级/打断规则、多任务聚合气泡、分场景提示音、减少动态、点击穿透与跨屏拖动、设置实时生效。
**不建议照搬**：平台原生 Helper（Qt/Swift/Python）与 DSH 插件安装/退出生命周期。WorkBuddyForMe 已有 Electron 壳与自己的进程管理，重复实现只会增加维护面。

## 2. 现状与差距

WorkBuddyForMe v2.6 已经具备：聊天、任务、Flow、多智能体协作、会议结论、知识库 RAG、记忆溯源、语音、Live2D/VRM 桌宠、情绪/关系、事件剧本、MCP/技能、运行报告、备份 v7。

差距不在「功能数量」，而在「工作状态的连续性」：

| 维度 | 现状 | 差距 |
|---|---|---|
| 运行状态 | `run-outcome.ts` 已把 task/flow/agent 归一为 8 个 RunOutcome（queued/running/waiting/succeeded/failed/cancelled/interrupted/budget_exceeded） | 这套口径只服务于列表/报告 UI；没有实时工作信号，也没有跨运行聚合 |
| 桌宠 | 消费语音/演出状态（thinking/speaking）与情绪、关系、事件剧本 | 不消费 task/flow/agent 运行事件；用户看不到「在查资料、在改文件、在等审批」 |
| 审批 | 已有 chat 工具确认弹窗、Flow 人工节点与工具确认、桌面控制授权 | 分散在各页面，没有全局待办收件箱、跨窗提示与统一超时策略 |
| 长任务 | Flow 由队列驱动，断线不取消；Agent 有 owner/observer；Task 的循环生命周期绑定当前 SSE 请求，断线即 abort | 任务类长任务关页即中断；缺少 owner lease、恢复、完成回投与后台作业视图 |
| 计划/待办 | 有 task steps、Flow 节点、会议行动项 | 没有会话级 goal/plan/todo；模型不能在对话中维护一份可评审的计划 |
| 复盘 | 有消息、tool_trace、task_steps、node_executions、agent_handoffs、运行报告 | 没有统一追加式事件日志；没有跨会话/运行的全局检索与导出；报告不能下钻到事件时间线 |
| 上下文治理 | 有会话摘要、知识分块、记忆检索 | 没有可见的上下文预算、压缩策略快照、大工具输出溢出与内容寻址附件 |
| 扩展 | 有技能、MCP、Flow/知识库模板、`.wbfm-pack` mod | 没有统一能力包清单/权限/可逆启停；接入外部代理没有稳定缝 |

## 3. 路线总览

| 版本 | 主题 | 一句话价值 | 依赖 |
|---|---|---|---|
| v2.7 | 会汇报 | 不用盯着主窗，也知道它现在在做什么、卡在哪、是否等你拍板 | v2.6 运行状态与桌宠 |
| v2.8 | 会计划，也会接着干 | 长任务不再绑在窗口上；先有计划，再执行，随时可接手 | v2.7 的工作信号与审批 |
| v2.9 | 可复盘 | 每一次回答/运行都能还原：模型看到了什么、做了什么、为什么失败 | v2.7/v2.8 的事件与运行归属 |
| v2.10 | 可扩展（候选） | 能力像积木一样装卸，但不把产品变成插件框架 | v2.7–v2.9 稳定的能力缝 |

顺序理由：v2.7 用最小改动把已有运行数据变成桌面价值；v2.8 修复「关页即中断」的真实可靠性缺口；v2.9 让前两者可审计、可检索；v2.10 只有在能力缝稳定后才值得做。

---

## 4. v2.7「会汇报」

**用户价值**：切到浏览器、IDE 或别的窗口时，桌宠能显示当前任务/Flow/协作的实时状态；等待审批会主动提醒并一键跳转；完成/失败有明确但不吵的反馈。

### 4.1 交付

1. **WorkSignal 统一模型（shared）**
   - 复用 `RunOutcome` 8 态，新增实时阶段：`phase = queued/running/waiting_approval/waiting_input/paused/done/error/disconnected`。
   - 活动类型：`thinking / searching / reading / writing / executing / verifying / meeting / speaking`。
   - 信号字段：`source(task|flow|agent|chat|meeting)`、`runId`、`title`、`stepLabel`、`completedSteps/totalSteps`、`todoDone/total`、`startedAt/updatedAt`、`errorReason`、`approvalKind`、`deepLink`。
2. **RunEventHub（server）**
   - 把 task/flow/agent 三套 SSE 事件归一为同一个 `RunEvent` 信封，进程内环形缓冲 + 有序 `seq` + 订阅/回放。
   - 页面与桌宠各自独立订阅；桌宠不依赖主窗页面是否打开。
   - 不新增运行表，运行真相仍来自现有 task_runs/workflow_runs/agent_runs。
3. **桌宠工作态（desktop + pet）**
   - 七态映射：`IDLE/THINKING/WORKING/WAITING/SUCCESS/ERROR/DISCONNECTED`；活动细分决定气泡文案与动作选择。
   - 优先级：拖拽/落地 > 完成/错误提示 > 等待审批 > 工作中 > 待机；完成/错误是 overlay，不改变基础状态。
   - 多运行聚合：等待审批优先；其次失败；再取最近活跃运行；气泡显示「1 个进行中 · 1 个待审批」与主运行步骤。
   - 交互规则：点击动作完整播完再回状态；新任务立即打断装饰动作；安静/标准/活泼三档待机节奏；减少动态；气泡顶部空间不足翻到下方。
   - 深链：点击气泡/状态卡打开 `/tasks/{id}`、`/flows/runs/{id}`、`/chat?conversation=&message=` 或 `/meetings/{id}`。
4. **审批注意力中心**
   - 统一收件箱：chat 工具确认、Flow 人工节点、Flow 工具确认、桌面控制授权、MCP 高风险工具。
   - 审批项字段：来源、运行标题、风险摘要、请求参数摘要、超时、允许/拒绝/打开。
   - 桌宠徽标 + 分场景提示音 + 系统通知（桌面态）；按 `runId+approvalId` 去重；勿扰时段只留徽标。
   - 默认 fail-closed：超时/断线统一拒绝并回写可读原因，不允许静默放行。
5. **P1（可选）**：桌宠气泡显示今日运行数/Token 用量；DeepSeek 余额/账户信息仅在用户显式配置后显示，失败保留上次成功结果。P1 不阻塞主体。

### 4.2 验收

- 同一任务状态能从 task/flow/agent 三个来源产出相同的 `WorkSignal`；纯函数 reducer 单测覆盖优先级、聚合、去重。
- 主窗最小化/切到其他页面时，桌宠在 2 秒内反映状态；审批到达后 2 秒内出现徽标/提示。
- 点击桌宠可跳到正确运行页；审批可从桌宠直接允许/拒绝；拒绝后运行 fail-closed。
- 同一审批/完成不重复通知；减少动态下不播放随机待机/点击动画；点击动作完整播完再回状态。
- `pnpm check`、单测、Web/桌面 e2e、300 行门禁通过。

### 4.3 Non-Goals

- 不改运行归属，不让 Task 在关页后继续（v2.8 做）。
- 不做 plan/todo/goal、事件日志、全局检索、能力包。
- 不做全平台原生 Helper；不引入 DSH 插件体系。
- 不做余额强绑定；没有凭据也能完整显示工作状态。

### 4.4 风险

- 事件频率过高导致桌宠 CPU/通知风暴：Hub 需节流/合并，桌宠只订阅聚合后的信号。
- 三套运行事件字段不一致：先冻结 `RunEvent` 信封，再接入，避免边接边改。
- 审批分散在旧组件：先做统一 API，再逐页替换入口，避免一次性重写。

---

## 5. v2.8「会计划，也会接着干」

**用户价值**：任务/Flow/协作不再因为关窗而中断；模型先给出可评审的计划与待办，再执行；长任务可随时接手、恢复、取消；到点可让 Agent 自己继续。

### 5.1 交付

1. **持久后台作业（server-owned jobs）**
   - 运行归属从「页面 SSE 请求」转为「服务端 job + owner lease」；页面、桌宠、舞台都是观察者。
   - 关窗/刷新/断网不取消；只有显式取消、预算耗尽、致命错误才终止。
   - 重启恢复：启动时扫描非终态运行，按 lease 判断接管或收敛为 interrupted（不伪造成功）。
   - 完成回投：job 完成后向所属会话写入一条助手消息/运行卡，并触发一次通知；去重。
   - 观察者订阅带回放与 `seq` 续传；多客户端不重复启动。
2. **会话目标 / 计划 / 待办**
   - Goal：会话级目标与成功标准，可编辑、可结案；跨回合保留。
   - Plan：有序步骤与状态（pending/running/done/skipped/blocked），支持用户评审、改写、批准后执行。
   - Todo：`todo_write` 工具维护轻量清单；与 Plan 的关系在 M0 冻结（建议：Todo 是 Plan 的轻量视图，不另建平行状态）。
   - UI：对话内计划卡、计划评审弹窗、运行页计划进度；桌宠气泡显示 `已完成/总数`。
3. **定时跟进**
   - 「30 分钟后继续」「明天提醒我看结果」走现有提醒调度，payload 携带 `conversationId/planId/runId`。
   - 到点只投递一次；注入对话为一条系统/助手消息；勿扰时段顺延；不在无人值守时执行桌面操作。
4. **子运行树（P1，可裁剪）**
   - 父子运行关系、子代理状态聚合到桌宠；父可查看/中断子运行。
   - 若工期紧张，本项延后到 v2.10，先保证单层 job 的可靠性。

### 5.2 验收

- 任务运行中关闭主窗，运行继续；重开页面能看到完整时间线；完成通知只出现一次。
- 服务重启后，非终态运行要么恢复接管，要么明确标记 interrupted；不出现幽灵 running。
- 计划在重启后保留；用户可驳回/改写计划；未批准的计划不自动执行高风险步骤。
- 定时跟进只触发一次；勿扰时段不打扰；无人值守时桌面操作仍被拒绝。
- 取消/预算上限行为与 v2.7 的桌宠状态一致；不出现「已取消但桌宠仍在工作」。
- 迁移只做加法；旧运行数据可读；回滚到 v2.7 不破坏数据。

### 5.3 Non-Goals

- 不做云端调度、跨设备作业。
- 不做无限并行/自由 N 角色群聊；预算与并发上限仍由服务端硬控。
- 不做自动批准、无人值守桌面执行。
- 不把计划系统做成通用项目管理（不引入甘特图、依赖图编辑器的完整能力）。

### 5.4 风险

- lease/接管语义复杂：M0 必须画出状态机与故障矩阵（崩溃、断网、重启、重复订阅、用户取消）。
- SQLite 并发与运行恢复：先做单进程内 job 注册表 + DB 租约，不引入外部队列。
- 完成回投可能重复：以 `runId+terminalSeq` 幂等键落库。

---

## 6. v2.9「可复盘」

**用户价值**：任何一次回答或运行都能还原：模型看到了什么、用了哪些工具、引用了哪些资料、为什么失败；能跨会话检索并导出，不依赖云端。

### 6.1 交付

1. **追加式事件日志**
   - 统一 `session_events`（SQLite 追加表）或按会话 JSONL；字段：`scope(chat|task|flow|agent)`、`scopeId`、`seq`、`type`、`payload`、`schemaVersion`、`createdAt`。
   - 现有 messages/task_steps/node_executions/agent_handoffs 继续作为业务表；事件日志负责「完整时间线 + 投影」，避免双写冲突。
   - 投影：聊天视图、任务时间线、Flow 执行时间线、协作 handoff 视图都从事件折叠；不新增第二套状态。
   - 模型可见输入：prompt 分段清单、工具 schema 版本、检索引用、记忆召回、压缩摘要、附件引用；敏感原文按引用/哈希落库，导出时可脱敏。
   - 事件 schema 版本 + 只前向迁移；保留策略（按大小/天数）可配置。
2. **全局检索与导出**
   - SQLite FTS5（复用知识库 CJK uni-gram 方案）覆盖消息与事件；筛选：日期、助手、来源、状态、工具。
   - 会话/运行导出 ZIP：消息、事件、步骤、handoff、引用、附件 manifest、运行报告；不包含密钥；可选脱敏。
   - 运行报告下钻：报告行 → 运行时间线 → 事件详情。
3. **上下文治理**
   - 压缩：阈值、摘要提示词、保留 pinned facts、压缩前后 token 对照；UI 显示上下文预算。
   - 溢出：大工具输出写入内容寻址文件/附件，模型只看到截断预览 + `spill://` 引用；UI 可打开全文。
   - 附件：内容寻址、去重、manifest；与备份一致。
4. **P1（可选）**：事件日志的「一键诊断包」：把失败运行的事件、配置、日志打包导出，供本地排查。

### 6.2 验收

- 进程被杀后重启，聊天/任务/Flow/协作时间线可从事件重建，且与业务表一致。
- 中文 2 字词可检索；检索结果与模型实际看到的上下文一致。
- 导出 ZIP 的 manifest 与实际文件一致；不含密钥；可选脱敏后仍可读。
- 压缩后 token 明显下降，关键事实不丢；溢出引用可解析；附件去重生效。
- 大历史库下检索/导出不阻塞主流程；数据库增长有上限与清理策略。

### 6.3 Non-Goals

- 不采用 DSH 的多代会话格式与 JSONL generation 迁移机制。
- 不做云同步、跨设备检索。
- 不记录密钥、完整系统凭据或未脱敏的敏感附件。
- 不追求「所有 prompt 原文永久保存」；以可重建与可审计为口径。

### 6.4 风险

- 事件日志与业务表双写：必须明确「事件是时间线真相、业务表是查询投影」还是相反；M0 先定一个方向。
- 数据库增长：需要保留策略与归档；导出包可能很大。
- 隐私：本地优先不等于可以无限记录；设置页必须提供保留周期与一键清理。

---

## 7. v2.10「可扩展」（候选）

**用户价值**：把技能、MCP、Flow、桌宠动作、事件剧本、报告卡做成可安装/可停用的能力包；需要时能接外部 Agent，但默认不改变本地优先与审批边界。

### 7.1 交付

1. **能力包清单**
   - `wbfm-capability.json`：`id/version/kind/permissions/entry/dependencies/checksums`；kind 覆盖 skill / mcp / workflow / pet-action / event-script / report-widget。
   - 本地安装、启用/停用、卸载；注册即 effect，停用自动回滚；冲突/依赖检查；签名可选。
   - 插件管理页：能力列表、权限、健康、日志、示例包。
2. **外部代理缝（可选）**
   - `SubagentProvider`：进程内子代理、DSH/ACP、Codex、Claude Code；统一预算、审批、证据回传。
   - 外部代理默认关闭，需显式授权；不共享密钥；失败可读。
3. **浏览器/电脑使用（可选）**
   - 作为能力包接入 browser-use/computer-use；域名/应用白名单、逐步审批、截图证据、禁止无人值守。
4. **不做的**：远程市场、任意 npm 安装、自动更新能力包、全套 Cordis。

### 7.2 验收

- 安装示例能力包后工具/UI/桌宠动作出现；停用后全部消失且无需重启。
- 未声明权限的能力包被拒绝；权限拒绝 fail-closed。
- 外部代理为可选依赖，缺失时核心功能不受影响。
- 能力包清单可导出/导入；校验和不匹配拒绝安装。

### 7.3 风险

- 供应链与权限模型是主要风险；在 v2.9 之前不启动。
- 容易滑向「通用插件框架」；必须坚持「单产品、本地优先、默认最小权限」。

---

## 8. 工程底座与红线

1. **能力缝**：v2.7 起把 `run events / approval / notification / tool` 定义成 Service Definition / Provider / Consumer 三角色；新实现通过注册接入，不直接改消费者。
2. **可逆注册**：新增子系统必须返回 disposer；停用/卸载回滚注册与订阅，避免全局单例与隐藏状态。
3. **单一状态真源**：`WorkSignal` reducer 是 UI、桌宠、通知、报告的唯一口径；禁止各页面各写一套优先级。
4. **模型可见即落库**：v2.9 起所有新增模型可见输入必须有事件/投影；先定 schema version，再写代码。
5. **本地优先红线**：无账号、无强制云、密钥不出机；无人值守桌面永久禁止；审批默认 fail-closed；导出默认脱敏。
6. **工程门禁**：TS strict、单文件 ≤300 行、四层测试不降级；新增运行/事件/审批模块必须有纯函数单测 + Web/桌面 e2e。

## 9. 决策点（2026-10-29 已确认）

1. v2.7 纳入「今日 token 用量」P1；DeepSeek 余额延后。
2. v2.8 先做单层后台任务；子运行树/子代理控制延后到 v2.10 评估。
3. v2.9 采用 SQLite 追加事件表 + 大工具输出溢出文件；不采用每会话 JSONL 作为主存储。
4. v2.10 先做能力包；外部代理/浏览器使用作为可选 Provider，默认关闭。
5. 保持「一个版本一个主题」不并行开发；v2.7 不夹带 v2.8 的 job 改造。
6. 四个阶段全部开发与验收完成后，统一以 v2.10.0 发布；开发期不逐版 tag/Release。

## 10. 参考

- DeepSeek Harness：`deepseek-harness-master/docs/architecture.md`、`packages/README.md`、`packages/interaction/README.md`、`packages/jobs/README.md`、`packages/subagent/README.md`、`packages/session-query/README.md`
- DSH 大肥鱼：`dsh-dafeiyu-main/README.md`、`docs/animation-behavior.md`、`runtime/animation_model.py`
- 本项目现状：`apps/web/src/lib/runs/run-outcome.ts`、`apps/web/src/app/api/tasks/[id]/events/route.ts`、`apps/web/src/app/api/flows/runs/[id]/events/route.ts`、`apps/web/src/app/api/agent/runs/[id]/events/route.ts`、`apps/desktop/src/main/pet/pet-manager.ts`
