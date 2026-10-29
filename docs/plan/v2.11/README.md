# v2.11 方案：可扩展 II——四类 effect 装满，外部代理从缝到实现

> 状态：M1、M2 已完成（2026-10-29，见 [M1 实施记录](02-M1-实施记录.md)、[M2 实施记录](03-M2-实施记录.md)），待 M3
> 上一正式版：v2.10.0（能力包：清单/校验/安装/启停/卸载 + 外部代理接口缝）
> 主题一句话：**v2.10 证明了「能力可以打包装卸」，v2.11 要证明「六类能力都能装卸，外部代理真的能跑」。**

## 1. 版本主题与目标

v2.10 只把 `skill` / `mcp` 两类 effect 接通，其余四类 `workflow` / `pet-action` / `event-script` / `report-widget` 在清单层保留、安装时明确拒绝；外部代理只留了 `SubagentProvider` 接口与空注册表。这留下两个半成品：

- 能力包的「统一装卸」只在两类资源上成立，用户仍要为工作流、桌宠动作、事件剧本、报告卡片各走一套手动入口；
- 外部代理有缝但没有实现，管理页只能显示「尚未接入」。

本版把这两件事做完，但守住 v2.10 的宪法：**不引入远程市场、不执行任意代码、不做 Cordis 全量插件化、不共享宿主密钥。**

### 1.1 成功指标（可验收）

| 指标 | 现状（v2.10） | 目标（v2.11） |
|---|---|---|
| 可安装 effect 的 kind | 2 / 6（skill、mcp） | **6 / 6** |
| 安装后立即生效 | skill、mcp 是 | 四类新 effect 同样「免重启、可回滚」 |
| 停用/卸载回滚 | 磁盘 + 内存成对回滚 | 六类统一，且**不删除用户历史运行/记录** |
| 示例包 | 仅 1 个技能示例 | 六类可下载，五类一键生效（`mcp` 为模板包，见 M0 D10） |
| 外部代理 | 接口 + 空注册表 | **1 个可用实现**（本地 CLI，默认关、逐次审批） |
| 外部代理证据 | 无 | 运行记录 + 工作信号 + 事件时间线可查 |
| 全量门禁 | Web e2e 120/120 | 不降级；新增能力包 e2e ≥ 2 例、外部代理 e2e ≥ 1 例 |

### 1.2 非目标（见 §8）

不做远程能力市场、自动更新、任意 npm 安装、任意脚本执行、ACP 跨平台 SDK、宿主密钥托管。

## 2. 现状与缺口（v2.10 取证）

| 层 | 现状 | 缺口 |
|---|---|---|
| 清单契约 | `CAPABILITY_KINDS` 六类、`CAPABILITY_REQUIRED_PERMISSION` 六项映射齐全 | `CAPABILITY_SUPPORTED_KINDS` 只有 `skill` / `mcp` |
| effect 分发 | `enableCapabilityEffect` / `disableCapabilityEffect` 按 kind 分派 | 其余四类走 `throw ApiError.validation('该能力类型尚未接入')` |
| effect 依赖 | `CapabilityEffectDeps = { skills, mcp, skillsDir }` | 缺工作流仓储、动作服务、事件剧本注册表、报告卡片仓储 |
| 工作流 | `workflows` + 版本表 + `publishVersion` + `setStatus(disabled)` 已具备 | 没有「从能力包安装图 → 建行 → 发布」的接线 |
| 桌宠动作 | `motion_assets`、`importMotion`（双校验 + 落盘 + 落库）、交互动画图覆盖已具备 | 没有「从包内 VRMA → 动作资产」的接线 |
| 事件剧本 | 内置剧本是 shared 常量，导演按注册表消费 | 没有用户安装剧本的存储与加载入口 |
| 运行报告 | 聚合表 + Markdown/CSV 导出 | 没有声明式卡片的数据契约与渲染位 |
| 外部代理 | `SubagentProvider` 接口 + 注册表（默认空） | 无实现、无配置、无运行记录、无审批接线 |
| 管理页 | 列表/权限/状态/effect/lastError/启停/卸载/示例包 | 只展示技能示例；外部代理只有一句说明 |

结论：**缺的不是新框架，而是四条「资源 → 可逆 effect」的接线**，加一条「外部进程 → 统一运行记录」的接线。

## 3. 功能清单

### P0 必做

**P0-1 `workflow` effect：把包里的图变成可运行工作流**

- 包内 `payload/workflow.json`：`{ name, description?, icon?, color?, graph }`，`graph` 复用现有 FlowGraph Zod 契约（节点/边/校验与画布一致）。
- 启用：`createWorkflow` → `addVersion(graph)` → `publishVersion`；`effectRef = workflowId`。
- 停用：`setStatus(workflowId, 'disabled')`，**不删除行**；历史运行与端点保留可查。
- 卸载：有运行记录时只转为 disabled 并保留行（记录归属包 id，便于「包已卸载」提示）；无运行记录且未被端点引用时删除行与版本。
- 验收：安装 → 出现在工作流列表且可试运行 → 停用后不可运行/不作为 `flow:<id>` 工具 → 卸载按上述规则清理。

**P0-2 `pet-action` effect：包内动作资产进入动作池**

- 包内 `payload/action.json`：`{ name, file, entryKey?, segment?, mood?, minRelationshipLevel? }`，`file` 为包内 `.vrma` 相对路径；文件走既有 VRMA 双校验（GLB 魔数 + `VRMC_vrm_animation` 扩展）与 10MB 上限。
- 启用：复制/读取 VRMA → `motionService.importMotion`（source 记录能力包 id）；`effectRef = motionId`。
- 停用：删除该 `motion_assets` 行与对应文件；不触碰用户自己导入的动作。
- 卸载：同停用，并清除包目录。
- 验收：安装 → 动作出现在动作池/选择器；停用后动作池恢复原状；坏 VRMA 安装失败且不留文件。

**P0-3 `event-script` effect：包内剧本进入导演注册表**

- 包内 `payload/script.json`：沿用现有声明式事件契约（8 类白名单 step、分支条件、trigger 元数据），**不引入新语法**。
- 新增 `installed_event_scripts` 表（迁移 v040，纯加法）：`id / pack_id / name / definition_json / enabled / created_at`。
- 启用：校验 JSON → 写行 → 注册到导演的剧本注册表；`effectRef = script id`。
- 停用：标记 `enabled=0` 并从注册表摘除；卸载删除行。
- 导演的三道锁（勿扰/对话中/冷却与每日上限）对安装剧本同样生效，不允许包绕过。
- 验收：安装 → 设置页剧本列表出现且可试运行；停用后不再触发；非法 step / 未知 intent 安装即 422。

**P0-4 `report-widget` effect：包内声明式报告卡片**

- 包内 `payload/widget.json`：`{ title, chain: 'task'|'flow'|'agent', metric: 'success_rate'|'run_count'|'median_duration'|'failure_top', windowDays: 7|30|90 }`。
- 新增 `report_widgets` 表（迁移 v040）：`id / pack_id / title / config_json / enabled / created_at`。
- 启用：白名单校验 → 写行 → 报告页渲染；停用删行；数据只读现有运行表/事件日志，**卡片不能执行查询或代码**。
- 验收：安装 → 报告页出现卡片且数字与现有报告一致；停用后消失；未知 metric 422。

**P0-5 六类示例包与管理页**

- `buildSamplePack(kind)` 替代单一技能示例：六类各给一个最小、可运行、可卸载的示例（工作流用两条节点的确定性图；桌宠动作给一个内置小 VRMA 或跳过二进制改为「示例动作 JSON + 需自备 VRMA」的说明性包，M0 决定）。
- 管理页：kind 筛选与徽章、effect 详情（工作流 id / 动作 id / 剧本 id / 卡片 id）、失败原因、示例包按 kind 下载。
- API：`GET /api/capabilities/sample?kind=<kind>` 覆盖六类；其余端点不变。

**P0-6 外部代理：第一个实现（本地 CLI 适配器）**

- 新模块 `packages/core/src/agents/cli-subagent-provider.ts`：按用户配置的 `command + args` 启动本地 CLI，stdio 上跑**严格 JSON Lines 协议**：

```text
→ {"type":"run","goal":"...","budget":{...}}          （宿主写入，一次）
← {"type":"delta","text":"..."}                        （可多次）
← {"type":"permission","title":"...","detail":"..."}   （需要时）
← {"type":"done","summary":"..."} | {"type":"error","code":"...","message":"..."}
```

- 约束：默认不注册任何提供方；用户显式启用并提供命令后才可用；每次运行前弹一次性审批（fail-closed）；超时（默认 10 分钟）与输出上限（默认 2MB）硬熔断；取消时杀进程树；`cwd` 必须由用户在运行对话框中显式选择，不默认用户主目录。
- 证据：运行写入 `subagent_runs`（迁移 v040）并复用 WorkSignal（`source='subagent'`）与 `session_events`；结果以一条助手消息回投（复用 v2.8 的幂等回投口径）。
- 密钥边界：宿主不读取、不传递供应商密钥；CLI 使用自己的登录态；接口不变（`SubagentProviderInput` 无凭据字段）。
- 验收：未启用时启动零影响；启用后「可用」状态实时反映命令是否存在；一次运行可在管理页/时间线看到证据；审批拒绝时不启动进程；超时收敛为 failed 且进程被回收。

### P1 争取

1. effect 健康检查与独立日志（`lastError` 之外的最近一次 effect 事件）。
2. 能力包签名验证（Ed25519 公钥白名单），承接 v2.10「只记录不验证」的欠账。
3. ACP 客户端作为第二个外部代理实现（协议优先，CLI 适配器作为兜底）。
4. 外部代理预算设置页（轮次/token/时长三档，服务端钳制）。

### P2 留白

- 远程能力市场 / 自动更新 / 一键升级。
- 能力包依赖图可视化与批量升级。
- 桌宠动作包的动画图自定义 step（避免与事件剧本职责重叠）。

## 4. 六类 effect 契约（M0 冻结候选）

| kind | payload | 启用（effect） | 停用 | 卸载 | effectRef |
|---|---|---|---|---|---|
| `skill` | `skill.json` + 资源 | 复制到技能目录 + reconcile | 删目录 + 移状态行 | 删目录 | 技能名 |
| `mcp` | `server.json` | `createServer` | `removeServer` | 同停用 | server id |
| `workflow` | `workflow.json` | 建行 + 存版本 + 发布 | 置 `disabled` | 有运行则保留禁用行，否则删行 | workflow id |
| `pet-action` | `action.json` + `.vrma` | 双校验 + 导入动作资产 | 删动作行与文件 | 同停用 | motion id |
| `event-script` | `script.json` | 校验 + 写行 + 注册导演 | `enabled=0` + 摘除 | 删行 | script id |
| `report-widget` | `widget.json` | 白名单校验 + 写行 | 删行 | 删行 | widget id |

统一纪律：**enable 失败必须回滚到 disabled 且不留半成品；disable 失败保留 enabled 状态与可读 `lastError`；卸载先 disable 再清包，依赖它的包存在时 409。**

## 5. 外部代理安全边界

| 风险 | 控制 |
|---|---|
| 任意命令执行 | 不内置任何命令；用户显式配置并启用；每次运行一次性审批（默认拒绝） |
| 宿主密钥外泄 | 输入契约不含凭据；不读取供应商密钥；子进程继承最小环境变量白名单 |
| 无限输出/挂死 | 超时 + 输出字节上限 + 取消杀进程树；超限收敛为 failed |
| 越权工作目录 | 运行时必须显式选 `cwd`；默认不允许用户主目录；不自动写入应用数据目录之外 |
| 证据缺失 | `subagent_runs` + WorkSignal + session_events 三处留痕；失败原因可读 |
| 多实现抢占 | 注册表同 id 重复注册抛错；注销函数成对；默认空注册表不影响启动 |

## 6. 数据模型与迁移

迁移 **v040**（纯加法，旧库可读）：

| 表 | 用途 | 关键列 |
|---|---|---|
| `installed_event_scripts` | 能力包安装的声明式剧本 | id / pack_id / name / definition_json / enabled |
| `report_widgets` | 声明式报告卡片 | id / pack_id / title / config_json / enabled |
| `subagent_runs` | 外部代理运行证据 | id / provider_id / status / summary / error / started_at / ended_at |

不改 `capability_packs` 结构；`effect_ref` 继续存副作用句柄（六类都有明确值）。备份格式是否升版由 M0 决定（预计不升，三张表按「可选轨」处理）。

## 7. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 契约冻结 | 六类 payload schema、effect 语义与卸载策略、外部代理 JSON 协议与审批口径、示例包形态、迁移字段 | 方案评审通过；[00-M0-契约冻结](00-M0-契约冻结.md) 已落盘 |
| M1 工作流 / 桌宠动作 effect | 两条资源接线 + 单元测试 + 示例包 | 安装/停用/卸载全链路；坏包负例 |
| M2 事件剧本 / 报告卡片 | v040 两张表 + 导演/报告页接线 + 示例 | 安装剧本受三道锁约束；卡片数字与报告一致 |
| M3 外部代理 | CLI provider + 设置面板 + 运行对话框 + 审批 + 证据 | 默认关；拒绝/超时/取消三态正确 |
| M4 管理页与收口 | 六类示例、kind 筛选、effect 详情、i18n、e2e | 能力包 e2e ≥2、外部代理 e2e ≥1 |
| M5 验收与发布 | 全量门禁、版本号、迁移验证、发布归档 | `pnpm check` / 单测 / 全量生产模式 e2e / 桌面冒烟不降级 |

## 8. 风险与取舍

- **workflow 停用保留行 vs 删除**：保留行会留下「包已卸载但工作流还在」的孤儿，删除又会丢历史运行关联。选择「有运行保留禁用行、无运行删除」，并在列表标注来源。
- **pet-action 需要 VRMA 二进制**：示例包若内置真实 VRMA 会显著增大仓库与包体积；M0 决定用「最小合法 VRMA」还是「说明性示例 + 用户自备」，后者牺牲可一键体验。
- **event-script 的表达式能力**：只允许现有白名单 step 与既有条件语法，拒绝任何模板执行/代码片段；能力包不成为脚本引擎。
- **report-widget 只做声明式指标**：不允许自定义 SQL/脚本，避免把报告页变成查询编辑器。
- **外部代理首选 CLI 而非 ACP**：CLI 适配器可覆盖多个代理命令、实现面小、可用 mock 可执行文件做 CI；ACP 作为 P1，避免 v2.11 被协议实现拖住。
- **外部代理不共享密钥**：代价是用户需要在各 CLI 自行登录；收益是宿主密钥面不变。
- **单文件 ≤300 行**：四条 effect 必须按 kind 拆文件，`capability-effects.ts` 只保留分派。

## 9. Non-Goals（本版明确不做）

- 不做远程市场、评分、自动更新、一键升级。
- 不做任意 npm 安装、任意脚本执行、任意代码加载。
- 不做 Cordis profile/bundle/patch 全量插件化。
- 不做 ACP/SDK 跨平台适配（P1 评估，不在 P0）。
- 不把宿主供应商密钥共享给外部代理。
- 不做能力包签名验证的强制门禁（P1；未签名仍按 v2.10 口径记录不验证）。
- 不做桌宠动作包的自定义动画图 step（留给事件剧本）。

## 10. 验收口径

1. 六类示例包逐个安装 → 生效 → 停用 → 卸载，全程免重启、无残留；坏包（缺权限/坏哈希/未知 metric/非法 step/坏 VRMA）逐类 422。
2. 依赖与冲突：缺依赖 422、版本不匹配 422、被依赖时卸载 409。
3. 外部代理：未启用零影响；拒绝审批不启动；超时/取消收敛为 failed/cancelled 且进程回收；证据可在时间线与运行记录查到。
4. `pnpm check`（typecheck 14/14、lint 0 error、300 行门禁）；单测不降级；Web 全量 e2e 生产模式通过；桌面冒烟不降级。
5. 迁移 v040 纯加法；旧库升级后可读，回退上一版不破坏数据。

---

## 附：遗留候选（不在本版）

- 压缩预算可视化、一键诊断包、单次运行下钻。
- 桌面控制授权并入审批中心、会议 WorkSignal、计划子运行树。
- 能力包市场与签名强制校验。
