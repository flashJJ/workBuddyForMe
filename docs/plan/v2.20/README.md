# v2.20 方案：看得见、分得清——过程图、光线与阶段化会话

> 状态：M0–M5 已完成（2026-11-03）；M6 本地验收与安装包已完成（2026-11-04），待 push/tag 发布 `v2.20.0`
> 上一正式版：v2.19.0（2026-11-03，已发布并置 Latest）
> 主题一句话：**让一次任务从开始到交付都能被看见，并能按阶段推进。**
> 来源分析：[v2.20-01 Lancer 借鉴分析](../../roadmap/scheduled/v2.20-01-lancer-borrowing-analysis.md)
> 分支：`feature/v2.20-planning`

## 1. 为什么是「看得见、分得清」

v2.19 把知识输入做深后，运行过程的表达仍是碎片化的：

1. 任务页有步骤时间线、Flow 页有节点时间线、协作卡有角色轮次、会议页有发言记录，但**彼此不连**；
2. 聊天页只有内嵌卡片，用户看不到「这条会话触发了哪些 task/flow/agent/meeting、产物从哪里来」；
3. 运行中的反馈只有状态徽标与滚动文本，缺少「动作 → 节点」的实时指向；
4. 普通会话想做「调研 → 分析 → 写作 → 交付」只能靠用户自己提示，Flow Studio 又太重；
5. 历史回看只能按单域查 `session_events`，无法从会话下钻到全过程。

v2.20 不加新能力面，只把「过程」和「阶段」两件事做顺：**RunGraph 统一投影 + Light UI 实时指向 + 会话阶段计划**。

## 2. 目标与成功指标

| 指标 | 现状（v2.19） | v2.20 目标 |
|---|---|---|
| 过程可见 | 四套时间线各自为政 | 一条会话下看到 chat/task/flow/agent/meeting 的统一图 |
| 实时反馈 | 状态徽标 + 文本流 | 新节点/状态跃迁发射光线；流动边框标记活跃节点 |
| 历史一致 | 按 scope 单域查看 | 图由 `session_events` 投影；历史加载不补演 |
| 阶段推进 | Flow DAG 或纯手写提示 | 1–8 阶段，阶段带模型/技能/目标/交付要求 |
| 阶段来源 | 无 | 角色卡/助手默认阶段按空缺复制到会话，会话内可改，后续修改不回溯 |
| 数据兼容 | schema v43 | 仅一次 `v044`；旧库/旧备份可恢复 |
| 行为回归 | 3067 单测 / 139 e2e | 不降级；新增投影/阶段/光线用例 |

## 3. 功能清单

### 3.1 P0（本版必须）

| # | 功能 | 用户故事 | 验收 |
|---|---|---|---|
| P0-1 | RunGraph 契约与投影 | 打开一条会话，能看到从消息到 task/flow/agent 的全过程；会议有独立图 | `shared` 类型 + `core/session-log` 纯函数；未知 payload 不抛错；节点去重 |
| P0-2 | RunGraph 只读 API | 刷新后图与事件日志一致，不依赖前端拼装 | `GET /api/conversations/:id/run-graph` 与 `GET /api/meetings/:id/run-graph`；按 `at` + `scope/seq` 稳定排序 |
| P0-3 | 图面板入口 | 聊天时看右侧过程图，回看时进 `/timeline` 图谱 | 同一组件复用于聊天右侧与 timeline；聚焦/折叠/错误隔离 |
| P0-4 | Light UI（按设计重写） | 新节点出现时有光线指向，活跃节点有流动边框 | 自研 4 模块；最多 12 条；历史不补演；reduced motion 直接完成 |
| P0-5 | 会议接入 | 会议发言也能看到同一套过程图 | `session_events` 新增 `meeting` scope；独立 `GET /api/meetings/:id/run-graph` + 会议页图；不混入会话根 |

### 3.2 P1（本版锁定）

| # | 功能 | 用户故事 | 验收 |
|---|---|---|---|
| P1-1 | 阶段计划存储 | 每个会话有自己的阶段计划，升级/备份不丢 | `conversation_stage_plans` 独立表 + `assistants.stage_plan_json` + `character_cards.stage_plan_json`；`v044` 迁移 |
| P1-2 | 阶段校验与提示词 | 阶段目标、技能、交付要求能被服务端校验并组装成任务 | shared Schema + core service；非法配置 422；技能不可用拒绝 |
| P1-3 | 阶段条与载入任务 | 在对话顶部切换阶段，点「载入任务」把目标送进输入框/发送 | 非空草稿阻止；运行中锁定；不自动发送；同一会话上下文 |
| P1-4 | 会话级阶段模型 | 阶段绑定的模型写入会话，后续轮次沿用 | `conversations.model_id`；切阶段写入/清空；模型无效 422；不改助手绑定 |
| P1-5 | 角色卡与助手默认阶段 | 6 张内置角色卡带默认阶段；应用卡/创建会话时按空缺复制 | 角色卡默认阶段只在目标为空时复制；不回溯覆盖；会话内可编辑 |
| P1-6 | 备份与 e2e | 阶段计划/助手与角色卡默认阶段能随备份恢复；关键路径有回归 | conversations 轨带 `stagePlan`/`modelId`；events 轨带助手与角色卡 `stagePlan`；e2e 覆盖载入/锁定/恢复 |

## 4. 架构影响

| 层 | 改动 |
|---|---|
| `packages/shared` | 新增 `types/run-graph.ts`、`types/run-outcome.ts`（`RunOutcome` 上移）、`schemas/work/stage-plan.ts`；`Conversation.modelId`；助手与角色卡 Schema 增加可选 `stagePlan` |
| `packages/core` | `session-log/graph.ts` 投影；`work-plan/stage-plan-service.ts` 校验/提示词/复制；模型解析优先 `conversation.modelId` |
| `packages/database` | 迁移 `v044`：`conversation_stage_plans` + `assistants.stage_plan_json` + `character_cards.stage_plan_json` + `conversations.model_id`；迁移测试同步 43 → 44 |
| `apps/web` | `features/run-graph/` 图面板；`components/ui/light-layer/` 光线层；`features/chat/stage/` 阶段条；助手/角色卡默认阶段；timeline/会议页图谱入口 |
| `apps/desktop` | 不改；不引入 Pi/Chord/worktree |
| 依赖 | 不新增运行时依赖；不引入 Lancer 源码包 |

## 5. 里程碑

| 里程碑 | 内容 | 出口 | 状态 |
|---|---|---|---|
| M0 决策与契约 | 本轮决策 + RunGraph/Light UI/StagePlan/会议/迁移契约 | 两份 M0 文档落盘；类型与 API 边界可评审 | 已完成 |
| M1 RunGraph 投影 | `RunOutcome` 上移、图类型、纯函数投影、单测 | 五域事件夹具可投影；未知 payload 不抛错 | 已完成（[03-M1 实施记录](03-M1-实施记录.md)） |
| M2 图 API 与面板 | 只读 API、轮询刷新、聊天右侧 + timeline、会议图 | 真实会话可看到五域节点；历史不重播 | 已完成（[04-M2 实施记录](04-M2-实施记录.md)） |
| M3 Light UI | 光线层 + 流动边框 + 图边连线 + SSE 追加 reducer | 新节点只发射一次；reduced motion/隐藏/卸载通过 | 已完成（[05-M3 实施记录](05-M3-实施记录.md)） |
| M4 阶段计划 | `v044` 迁移、Schema/服务/API、角色卡/助手默认阶段复制 | 迁移/备份恢复通过；非法配置 422 | 已完成（[06-M4 实施记录](06-M4-实施记录.md)） |
| M5 阶段 UI 与模型切换 | 阶段条、编辑、载入任务、会话级模型切换 | 草稿/运行中闸门；同一会话上下文；模型切换生效 | 已完成（[07-M5 实施记录](07-M5-实施记录.md)） |
| M6 验收与发布 | 全量回归、a11y/性能、版本与安装包 | 不降级；发布 v2.20.0 | 本地验收完成，待发布（[08-M6 验收与发布](08-M6-验收与发布.md)） |

## 6. 风险与取舍

| 风险 | 影响 | 缓解 |
|---|---|---|
| 图变毛线球 | 长会话节点多、跨域边多 | 默认聚焦当前运行；按 run 折叠；节点上限 + 虚拟化；标签可关 |
| 事件与 UI 不一致 | 乐观节点残留、历史重播 | 先落库/先有事件再发射；图只读投影；历史基线不发射 |
| Light UI 重写偏差 | 轨迹/暂停/锚点行为与上游不一致 | API 契约 + 纯函数单测 + 视觉验收；只要求关键行为等价 |
| 会议事件缺口 | best-effort 写入失败导致缺帧 | 写入失败不阻断会议；图降级展示并保留补写入口 |
| 阶段越权 | 前端校验被绕过、运行中改阶段 | Schema 服务端复用；运行中 UI 硬锁；载入任务不自动发送 |
| 会话模型污染助手默认 | 阶段模型影响同会话后续轮次 | 会话级 `model_id` 独立于助手；切回无模型阶段清空覆盖；缺省走助手/系统默认 |
| 迁移/备份兼容 | 旧库/旧备份恢复失败 | 只 `CREATE TABLE`/`ADD COLUMN`；备份字段可选；迁移与恢复测试列为 M4 门禁 |
| 范围膨胀 | 借成 Lancer 克隆 | 本版只做 P0+P1；自由分支/工作树/扩展宿主留后续 |

## 7. Non-Goals

- 不做按 token 的光线；不做 Git 提交树、worktree 与 turn checkpoint；
- 不做自由分支会话（v2.21 独立立项）；
- 不做 Lancer 模块分区（video/research/paper/github/xhs）；
- 不替代 Flow Studio，不做自动连续执行全部阶段；
- 不复制 `light-ui` 源码，不引入 Pi/Chord/extension-ui 运行时；
- 不做 macOS 豆包接管、远程能力市场、云同步、团队共享；
- 不做独立的内置阶段模板库；默认阶段放入 6 张内置角色卡，按空缺复制。

## 8. 验收口径

1. 一条真实会话可在 RunGraph 中看到 chat/task/flow/agent 节点；会议页可看到 meeting 节点的独立图。
2. 图节点数、边、状态与 `session_events`/运行表一致；未知/截断 payload 不抛错、不产生重复节点。
3. 历史加载不补演光线；新事件同一身份只发射一次；`prefers-reduced-motion` 不飞行；卸载后无残留 SVG/监听器。
4. 阶段计划 1–8 阶段、标题 ≤40 字、技能 ≤12、目标/交付各 ≤4000 字；非法配置 422；技能不可用拒绝。
5. 「载入任务」不自动发送；非空草稿阻止；运行中禁止改阶段/载入。
6. 阶段模型写入 `conversations.model_id`，同会话后续轮次沿用；切回无模型阶段清空覆盖；模型无效 422。
7. 6 张内置角色卡带默认阶段；应用角色卡/创建会话时只在目标为空时复制，之后修改不回溯覆盖。
8. `v044` 迁移与备份恢复通过；旧库直接可开；`pnpm check` / `pnpm test` / `pnpm build:web` 不降级。

## 9. 已决策

| 决策 | 结果 |
|---|---|
| 主题 | 看得见、分得清：过程图 + Light UI + 阶段化会话 |
| 范围 | P0 + P1；P2 自由分支到 v2.21 |
| 图数据 | 服务端 snapshot + SSE 追加 |
| 图密度 | 全量主线 + 执行节点；默认聚焦当前运行，其他折叠 |
| 图入口 | 聊天右侧 + `/timeline` 图谱视图；会议页独立图入口 |
| Light UI | 按设计重写；标准强度（最多 12 条、1200ms） |
| 会议 | 扩展 `session_events` 的 `meeting` scope |
| 阶段存储 | `conversation_stage_plans` + `assistants.stage_plan_json` + `character_cards.stage_plan_json` |
| 阶段来源 | 角色卡/助手默认阶段按空缺复制，创建会话时快照，不回溯覆盖 |
| 阶段模型 | 会话级 `conversations.model_id`；切阶段写入/清空 |
| 内置预置 | 6 张内置角色卡各带默认阶段，不新增内置助手 |
| 迁移 | 一次 `v044`；备份并入 conversations/events 轨 |

完整决策见 [01-M0 决策记录](01-M0-决策记录.md)；契约细节见 [02-M0 契约冻结](02-M0-契约冻结.md)。
