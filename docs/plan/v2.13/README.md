# v2.13 方案：可治理的 Agent——每次执行都可授权、可约束、可审计

> 状态：📐 M0 契约冻结（2026-10-31，见 [00-M0-契约冻结](00-M0-契约冻结.md)），待评审
> 上一正式版：v2.12.0（能力包收口：签名、升级回滚、健康自检）
> 调研输入：[竞品对比与借鉴](00-竞品对比与借鉴.md)
> 主题一句话：**v2.12 让能力包可信，v2.13 让 Agent 的每一次执行都可授权、可约束、可审计。**

## 1. 版本主题与目标

v2.12 把「装进来的东西」收口了：签名可验证、升级可回滚、坏了能自检。但「它跑起来之后」仍然缺少治理：

- **权限只有三档分级**：工具标注 `read` / `write` / `danger`，授权按「工具 × 助手」记忆；没有一个「本次任务要多严」的执行档位，也没有工作目录约束 [^1]。
- **审批只确认「这一次」**：审批项记录工具名与参数摘要，但没有绑定具体参数、目录、环境与文件；审批通过后执行路径缺少二次比对。
- **没有独立审计账本**：`task_steps` 与 `session_events` 是产品时间线，不是「谁在什么策略下允许/拒绝了什么」的治理证据。
- **定时任务只能提醒**：`scheduled_tasks` 的 payload 只有 `follow_up`，不能无人值守跑一次 Agent 任务，也没有运行历史与结果通知闭环 [^2]。

竞品已经把这三件事做成系统能力：Cherry Studio 的五档权限模式与工作目录、OpenClaw 的策略即代码与审批绑定、Open WebUI 的版本化与回滚 [^3]。v2.13 借鉴它们，但不照搬云端与多用户形态。

### 1.1 成功指标（可验收）

| 指标 | 现状（v2.12） | 目标（v2.13） |
|---|---|---|
| 执行权限模式 | 无（只有工具三级权限） | **五档**：每次确认 / 自动接受编辑 / 智能审批 / 仅计划 / 完全放行 |
| 工作目录 | 无（外部代理 cwd 单独校验） | 任务级工作目录；文件与命令操作限定在目录内，符号链接 realpath 校验 |
| 策略即代码 | 无 | 设置内 JSON 策略：工具 / 路径 / 域名 / 命令 / 限额；**deny wins** |
| 审批绑定 | 只绑定 callId | 绑定工具、参数哈希、cwd、环境哈希、文件操作数与策略哈希；漂移即拒绝 |
| 审计账本 | 无独立账本 | 追加式哈希链账本；可按运行 / 时间 / 决策过滤、校验完整性、导出 JSONL |
| 定时 Agent | 仅提醒 | 定时触发 Agent 任务；运行历史可查；完成通知与审批挂起；无人值守 mode 白名单 |
| 全量门禁 | Web e2e 125/125 | 不降级；新增治理 e2e ≥ 3 例 |

### 1.2 非目标（见 §7）

不做 IM 渠道、多用户身份、云 Worker、远程市场、任意代码执行、OS 级沙箱；隔离网页会话列为 P1，不阻塞本版。

## 2. 现状与缺口（v2.12 取证）

| 面 | 现状 | 缺口 |
|---|---|---|
| 工具权限 | `PermissionLevel = read / write / danger`；`isAllowed()` 按工具 × scope 查授权记录；`remember` 支持 assistant / all / task [^1] | 没有任务级执行档位；没有工作目录；full_access 这类「本次放宽」无法表达 |
| 工具门控 | `gateToolPermission` 在 write/danger 未授权时挂起，登记审批中心；超时/断线按拒绝 [^4] | 审批项只有 `argsSummary` 文本；没有结构化绑定，无法在执行前做漂移比对 |
| 桌面 Agent | 观察 → 决策 → 门控 → 执行 → 再观察；步数 / 失败数 / 熔断 / 急停护栏 [^5] | 没有「仅计划」「完全放行」档位；没有工作目录；没有策略快照与治理审计 |
| 外部代理 | 运行审批 + 子进程 permission 帧；cwd 校验；证据落 subagent_runs / WorkSignal / session_events [^6] | 运行审批绑定 runId，不绑定 command/cwd/env；permission 帧也不绑定具体参数 |
| 定时任务 | `scheduled_tasks` 仅 `once/daily/weekly` + `payload.kind='follow_up'`；tick 先标记后投递 [^2] | 不能跑 Agent；没有运行历史；没有结果通知与审批挂起 |
| 事件日志 | `session_events` 追加式、按 scope 查询、180 天保留 | 是业务时间线，不是治理账本；无哈希链，不能回答「策略是否被绕过」 |
| 设置 | settings JSON + Zod 校验 + 读取钳制 | 无 Agent 策略分组；无策略版本 / 哈希 |
| 迁移 | v040，零迁移 | 本版需要 v041 纯加法（运行治理字段 + 审计表） |

## 3. 功能清单

### P0 必做

**P0-1 执行权限模式与工作目录**

- 新增 `AgentPermissionMode`：`confirm_each`（默认）/ `auto_edits` / `smart_approve` / `plan_only` / `full_access`。
- 模式在「任务启动」时选择，写入 `task_runs.permission_mode`；定时 Agent 任务在任务定义里固化。
- 工作目录 `workspacePath` 可选；文件与命令类操作必须落在目录内。桌面键鼠操作不适用目录，只受工具策略与模式约束。
- 默认档保持 v2.12 行为：`read` 放行，`write` / `danger` 需审批。
- `full_access` 必须二次确认，且只对当前运行生效；无人值守运行必须显式在策略 `unattended.allowedModes` 中放行。
- 工作目录校验：绝对路径、存在、非系统目录 / 数据根 / 用户主目录根；realpath 后再次校验；符号链接指向目录外一律拒绝。

**P0-2 策略即代码**

- settings 新增 `agentPolicy`：工具 allow/deny、路径允许根与敏感目录、域名 allow/deny、命令 allow/deny、运行限额。
- 求值顺序固定：硬拒绝（系统保留）→ 策略 deny → 已有权限 deny → 模式 → 策略 allow → 已有授权 → 默认询问。**deny 永远优先。**
- 策略带 `version`；保存时 Zod 校验并计算 `policyHash`；启动运行写入 `policy_snapshot_json`。
- 读取时钳制：非法值回落默认；未知字段丢弃；策略过大 / 规则过多直接拒绝保存。
- 策略变更写审计事件；设置页提供可视化编辑 + JSON 导入导出。

**P0-3 审批绑定具体操作**

- 审批请求新增结构化 `binding`：`tool`、`argsHash`、`cwd`、`envHash`、`fileOperands[]`、`target`（窗口/进程）、`policyHash`。
- 审批通过后，执行前重新计算 binding；任一字段变化返回 `APPROVAL_BINDING_DRIFT`（409）并审计。
- 外部代理运行审批绑定 command + args + cwd + env 哈希；子进程 permission 帧绑定帧 id + 参数哈希。
- 审批超时、断线、无审批 UI 一律拒绝；拒绝结果结构化回灌模型，不让 Agent 误以为执行成功。

**P0-4 执行审计账本**

- 迁移 v041 新增 `audit_events`（纯加法）：id、seq、created_at、kind、actor、run_id、conversation_id、tool、decision、reason_code、policy_hash、binding_json、outcome、prev_hash、hash。
- 事件种类：策略变更 / 策略拒绝 / 审批请求 / 审批通过 / 审批拒绝 / 审批超时 / 绑定漂移 / 运行开始 / 运行结束 / 定时运行触发 / 无人值守拒绝 / 完整性校验。
- 哈希链：`hash = sha256(prev_hash + canonicalJson(事件去掉 hash))`；`prev_hash` 取上一条；提供校验接口，发现断链返回 `AUDIT_CHAIN_BROKEN`。
- 追加只读：不提供删除 / 修改 API；保留期默认 365 天，按天清理；导出 JSONL。
- 审计写入失败的处理：`danger` 操作 fail-closed（拒绝执行）；`read` 操作记录告警后继续。

**P0-5 定时 Agent 任务**

- `scheduled_tasks.payload` 扩展为判别联合：`follow_up`（既有）｜`agent_task`。
- `agent_task` 字段：`goal`（≤2000）、`conversationId`、`assistantId`、`permissionMode`、`workspacePath?`、`maxSteps?`、`notify`（`work_signal` / `desktop` / `none`）。
- tick 命中后创建 `task_run`（`origin_scheduled_task_id`），由任务运行服务后台启动；运行历史复用现有任务面板与时间线。
- 无人值守审批：需要审批的操作挂起并进入审批中心；超时拒绝；运行终态写 WorkSignal 与通知；审计记录触发与终态。
- 幂等：同一任务同一触发时刻只创建一次运行；错过触发按「错过即跳过」口径，不补跑。
- 上限：单任务步数沿用 `TASK_MAX_STEPS`；策略可下调；同一时刻无人值守运行数受策略限额约束。

### P1 争取

1. **隔离网页会话**：独立 Electron session partition / 独立浏览器窗口，网页任务不共享用户登录态；无网络到回环地址；先桌面端，Web 模式降级提示。
2. **技能/工作流版本化**：复用能力包升级状态机，为技能与工作流保存版本并支持 `Set as Production` 回滚；回滚前校验依赖仍可用。
3. **运行记录下钻**：从审计账本 / 审批中心跳到对应任务时间线并按 runId 过滤（承接 v2.12 遗留）。

### P2 留白

- IM 渠道（飞书 / 微信 / Telegram）与远程访问；需要身份、凭证与网络暴露设计，单独立项。
- 无头守护 + 有状态 API + 权限密钥。
- 子 Agent 并行与便携 Recipes。
- 多用户与团队部署。

## 4. 架构影响

| 层 | 改动 |
|---|---|
| `packages/shared` | `AgentPermissionMode`、策略 Zod schema、审批 binding 类型、审计事件类型、错误码 / 文案；任务创建与定时 payload 扩展 |
| `packages/database` | 迁移 v041：`task_runs` 四列 + `audit_events` 表与索引；审计仓储（追加 / 查询 / 校验游标） |
| `packages/core` | 策略求值器、工作目录校验、审批绑定与漂移比对、审计服务、定时 Agent 触发；接入工具门控、桌面 Agent、外部代理 |
| `apps/web` | 任务启动对话框（模式 / 目录）、设置页治理分组、审计页、定时任务表单、审批中心绑定展示；新增 policy / audit 路由 |
| `apps/desktop` | 工作目录选择复用既有 dialog 桥；隔离网页会话（P1） |
| `scripts` | 无新增 |

数据模型：**迁移 v041 纯加法**。策略与信任配置仍存 settings JSON；审计账本是独立表，便于哈希链与查询。

## 5. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 契约冻结 | 权限模式矩阵、策略 schema 与优先级、审批 binding、审计事件与哈希链、定时任务口径、API/UI 口径 | 方案评审通过，[00-M0-契约冻结](00-M0-契约冻结.md) 落盘 |
| M1 模式与工作目录 | shared 类型与 Zod、任务创建字段、工作目录校验、启动对话框、任务详情展示 | 五档模式默认行为与 v2.12 一致；目录越界被拒 |
| M2 策略与审批绑定 | 策略求值器、settings 分组、工具门控 / 桌面 Agent / 外部代理接入、漂移拒绝、审批中心展示 | deny wins 全矩阵通过；漂移必拒 |
| M3 审计账本 | v041 迁移、审计服务、哈希链校验、审计页与导出、策略变更事件 | 篡改可检出；导出 JSONL 可验 |
| M4 定时 Agent | payload 扩展、触发创建运行、无人值守审批挂起、通知与运行历史、定时任务表单 | 定时跑通；超时拒绝；WorkSignal 通知 |
| M5 验收与发布 | 全量门禁、版本 2.13.0、迁移与回退验证、桌面冒烟、安装包归档、发布文档与博客 | check / 单测 / 生产 e2e / 桌面冒烟不降级 |

## 6. 风险与取舍

- **默认档必须保持旧行为**：已有用户升级后不能突然被要求更多确认或放开权限；`confirm_each` 作为默认，等价 v2.12 的 write/danger 审批。
- **策略复杂度**：v1 只做白名单 / 黑名单 / 根目录 / 域名 / 命令 / 限额，不做表达式语言；规则数量设上限，超限拒绝保存。
- **审计写入开销**：单机低频，每次执行最多几条事件；批量插入 + 索引，避免把审计做成性能瓶颈。
- **无人值守审批**：没有 UI 时不能「默认允许」；审批挂起 + 超时拒绝是唯一正确路径，代价是任务可能停在等待审批。
- **工作目录边界**：Windows 盘符、大小写、短路径、符号链接都要归一化后校验；用户主目录根与系统目录一律拒绝。
- **迁移与回退**：v041 纯加法，旧版本不读取新列 / 新表；回退不删除审计数据。
- **隔离网页会话 P1**：需要新的浏览器工具与桌面壳配合；若 M2–M4 超期，不阻塞发布，按 P1 记录。

## 7. Non-Goals（本版明确不做）

- 不做 IM 渠道、远程访问、多用户与团队部署。
- 不做云 Worker、云端执行、跨设备续跑。
- 不做远程技能市场与一键安装；能力包仍是本地 + 签名 + 信任库。
- 不做包内任意代码执行；技能脚本能否执行由模式与策略决定。
- 不做 OS 级沙箱 / 虚拟机隔离；隔离网页会话最多做到独立浏览器会话。
- 不做策略表达式语言、图形化规则编排。
- 不做自动依赖安装与传递闭包。

## 8. 验收口径

1. 模式矩阵：五档模式 × 三类工具（只读 / 变更 / 高危）× 工作目录内外逐格通过；默认档与 v2.12 一致。
2. 策略：deny wins；策略拒绝返回 403 且审计；策略变更带哈希；非法策略保存被拒。
3. 审批绑定：参数 / 目录 / 环境任一漂移返回 409 并审计；超时 / 无 UI 一律拒绝。
4. 审计：哈希链可校验；直接改库后校验失败；导出 JSONL 与界面一致；无删除入口。
5. 定时 Agent：按时触发、创建运行、无人值守审批挂起、超时拒绝、终态通知；同一触发时刻不重复创建。
6. 迁移：v040 → v041 旧库升级数据保留；回退旧版本可打开同一数据库。
7. 门禁：`pnpm check`、八包单测、Web API 集成、生产模式 Web 全量 e2e（不低于 128 例）、桌面冒烟不降级。

## 9. 与 v2.12 遗留项 / 竞品借鉴的对应

| 来源 | 处置 |
|---|---|
| v2.12 P1：符号链接 realpath 校验 | v2.13 P0-1 工作目录校验 |
| v2.12 P1：运行记录下钻 | v2.13 P1-3（若 M3 有余量） |
| v2.12 P1：技能版本化 / 回滚 | v2.13 P1-2，不阻塞发布 |
| v2.12 P1：降级、密钥轮换 | 仍列后续版本 |
| 竞品：Cherry 五档权限模式 | P0-1 |
| 竞品：OpenClaw 策略即代码 / 审批绑定 | P0-2 / P0-3 |
| 竞品：OpenClaw 审计与版本化状态 | P0-4（审计）；版本化列 P1 |
| 竞品：Cherry / Cowork 定时 Agent 任务 | P0-5 |
| 竞品：Cowork / OpenClaw 隔离执行 | P1-1 |
| 竞品：Open WebUI 技能版本化 | P1-2 |
| 竞品：IM 渠道 | P2，单独立项 |

---

[^1]: 权限分级见 `packages/shared/src/types/permission.ts`，授权记录见 `packages/core/src/services/permission-service.ts`。
[^2]: 定时任务契约见 `packages/shared/src/schemas/scheduled-task.ts`，tick 见 `packages/core/src/scheduler/scheduler-tick.ts`。
[^3]: 竞品依据见 [竞品对比与借鉴](00-竞品对比与借鉴.md)（Cherry Studio Work Agent、OpenClaw 策略即代码、Open WebUI v0.12.0）。
[^4]: 工具门控见 `packages/core/src/chat/tool-permission-gate.ts`。
[^5]: 桌面 Agent 循环见 `packages/core/src/agent/task-loop.ts`。
[^6]: 外部代理审批见 `packages/core/src/agents/subagent-approval.ts`。
