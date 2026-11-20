# v4.14 桌宠动作接线与视觉巡检选型（含 docs 版本地图）

> 状态：已批准（2026-11-19）
> 上游：[v4.13 代码健康度重构计划](../v4.13/00-code-health-refactor-plan.md)
> 关联：[开发与测试指南](../../development.md)、[v0.7 playwright-mcp 评估](../../roadmap/v0.7-playwright-mcp-eval.md)

## 1. 结论摘要

| 议题 | 决策 | 本版动作 |
|---|---|---|
| `event.fire` / `chat.request` | 两个 ActionChain 动作**当前不可达**，不做 IPC 铺路；v4.15 删除变体，能力若需要另设入口 | 仅文档定契约 |
| 桌宠发起聊天（若要做） | 预填草稿 + 聚焦主窗，**不自动发送**；入口走桌宠右键菜单，不走动作链 | 登记为 v4.15 可选项 |
| 视觉巡检 | 分层：Playwright 截图基线（默认）/ Midscene（可选、需凭据）/ Playwright MCP（仅人工探索） | 仅文档定层 |
| docs 版本归类 | 只加索引层，不移动目录（零断链）；新增 `docs/plan/README.md` 版本地图 | 执行 |

一句话：先把「配置能表达的动作」与「真实可触发的入口」对齐，再谈视觉巡检；文档先做索引不改路径。

## 2. 现状证据（可复核）

### 2.1 `event.fire` / `chat.request` 为什么不可达

1. 类型定义：[interaction-actions.ts](../../../packages/shared/src/schemas/interaction/interaction-actions.ts) 第 21–22 行声明了两个动作变体。
2. 动作目录：[interaction-chains.ts](../../../packages/shared/src/schemas/interaction/interaction-chains.ts) 只有 8 个 `ACTION_CHAIN_IDS`，`ACTION_CHAINS` 中没有任何链包含这两个动作。
3. 配置校验：[settings.ts](../../../packages/shared/src/schemas/ops/settings.ts) 的 `interactionGraphEntrySchema.chainId` 是 `z.enum(ACTION_CHAIN_IDS)`，用户覆盖条目只能引用内置链，不能自定义动作内容。
4. 自定义触发器：短语触发器最终只落到 `eventId`，不产生 ActionChain。
5. 执行器：[action-executor.ts](../../../apps/web/src/features/interaction/action-executor.ts) 只打印 `console.warn`，且 `exec()` 在 `controllerRef.current` 为空时整体早退。

结论：没有任何配置路径能产生这两个动作；同时「无 controller 时字幕也被跳过」是现存缺陷。

### 2.2 桌宠是瘦终端

- 契约：[pet.ts](../../../packages/shared/src/pet.ts) 明确「桌宠窗无聊天请求」，`WbfmPetBridge` 只有 `focusMain(path?)` 与 `relayPerformance`。
- `EventDirector` 在主窗：`useChatEvents` → `useEventStage`，持有 CONV 锁/勿扰/冷却/每日上限。
- 聊天草稿在主窗：`chat-page.tsx` 的 `draft` / `composerFocus`，已有 `onTaskPrepared` 预填先例。
- `ActionExecutor` 只在桌宠窗 `pet-stage.tsx` 构造。

因此动作若要在桌宠窗执行聊天/事件，必须跨 IPC 回主窗；本地直接执行会绕过门控与唯一聊天出口。

### 2.3 视觉巡检现状

- `tests/e2e` 有 43 个 spec，但**没有任何** `toHaveScreenshot` / `toMatchSnapshot`。
- CI 跑在 `ubuntu-latest`，Chromium 由 Playwright 安装；nightly 只跑确定性验收，非阻断。
- v0.7 已评估过 Playwright MCP：打包增量约 280MB、需 CDP 或子进程管理，结论是不进产品、不进 CI。

### 2.4 docs 现状

- `docs/plan` 下 64 个版本目录（含 v4.14），**没有 README 索引**；`P0-*` 嵌套在 `v2.4-product-comparison`，`concepts` / `pet-engine` / `milestone-m4-m5` 嵌套在 `v3.0`。
- 全仓 `docs/plan/` 引用约 64 处、分布在 30 个文件；物理移动目录会批量断链。

## 3. 决策 D1：`event.fire`

### 3.1 候选

| 方案 | 做法 | 优点 | 代价/风险 |
|---|---|---|---|
| A1 主窗 EventDirector 统一入口 | 桌宠经新 IPC 回主窗调用 `eventStage.triggerEvent(sceneId)` | 走全量门控；单一事件真源 | 改 shared 契约 + 主进程 + preload + 主窗订阅；主窗未挂载时丢弃 |
| A2 桌宠本地演出 | `ExecutorDeps.fireScene` → `script.playScene(sceneId)` | 零 IPC、低延迟 | 绕过 CONV 锁/勿扰/冷却/每日上限；仅 VRM；与主窗事件系统分叉 |
| A3 删除动作变体 | 从类型、执行器、录制器移除 | 消除死代码与误导性告警；无新风险 | 如果未来要做，需要重新加回 |

### 3.2 选定：A3（本版只定契约，v4.15 执行）

理由：动作链是「用户可配置的表达」，而这两个动作既无入口也无参数来源；先铺 IPC 会制造更大的死代码面。事件剧本能力已由 `EventDirector` 的触发器、主窗试演菜单和桌宠剧本导演覆盖，不通过动作链触达。

v4.15 精确改动：

- `packages/shared/src/schemas/interaction/interaction-actions.ts`：删除 `event.fire` 与 `chat.request` 两个联合成员。
- `apps/web/src/features/interaction/action-executor.ts`：删除两个 `case`；把 `controllerRef.current` 的空判断下移到仅 controller 类动作，`subtitle.*` 不再受模型是否加载影响。
- `apps/web/src/features/avatar/script/recorder.ts`：删除两个 `case`，保持 switch 穷尽。
- `apps/web/src/features/avatar/script/recorder.test.ts`：删除两条「返回 null」断言。
- 新增 `apps/web/src/features/interaction/action-executor.test.ts`：覆盖「无 controller 仍触发字幕」「有 controller 才调用交互/表情」。
- 验证：`pnpm typecheck && pnpm lint && pnpm test:unit && pnpm check`。

## 4. 决策 D2：`chat.request` 与「桌宠发起聊天」

### 4.1 候选

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| B1 预填草稿 + 聚焦（推荐） | 桌宠右键菜单 → 主窗 `setDraft(prompt)` + 聚焦 + toast | 不花钱、不替用户表达；与 `onTaskPrepared` 语义一致 | 需要新增 pet→main 通道 |
| B2 自动发送 | 主窗直接 `session.send(prompt)` | 一步到位 | 消耗 token、可能误触任务模式、越权替用户发言 |
| B3 仅 toast 引导 | 只提示「去主窗聊」 | 最保守 | 体验弱，等于没做 |

### 4.2 选定：B1；入口放在右键菜单，不放动作链

- 不新增 `PET_QUICK_ACTIONS` 往返：右键菜单本身由主进程 `pet-menu.ts` 持有，菜单项可直接 `focusMain('/chat')` 并向主窗 `webContents.send` 语义键，主窗用 i18n 解析成草稿。
- 文案走 i18n 语义键，IPC 不传自由文本，避免注入与超长载荷。
- 只有未来需要「脚本生成动态 prompt」时，才扩展为受限原文通道（限长 + 净化）。

v4.15 若确认要做，精确改动：

- `packages/shared/src/pet.ts`：新增 `onChatRequest(cb: (promptKey: string) => void): () => void`，并加语义键白名单 `PET_CHAT_PROMPT_KEYS`。
- `apps/desktop/src/main/pet/pet-manager.ts` + `pet-menu.ts`：菜单项「聊两句」→ `focusMain('/chat')` + `main.webContents.send('pet:chat-request', key)`。
- `apps/desktop/src/preload/index.ts`：暴露 `onChatRequest`。
- `apps/web/src/features/chat/page/chat-page.tsx`：订阅 → `setDraft(t(key))` + `setComposerFocus(v => v + 1)`，不调用 `session.send`。
- 测试：shared 白名单单测；chat-page 订阅单测（预填但不发送）。

## 5. 决策 D3：视觉巡检分层

### 5.1 候选对比

| 维度 | L1 Playwright 截图基线 | L2 Midscene 语义断言 | L3 Playwright MCP |
|---|---|---|---|
| 确定性 | 高（基线 + 像素比阈值） | 中（模型判定有波动） | 低-中（Agent 路径不定） |
| 外部凭据 | 无 | 需 VLM Key | 需模型 + Agent 运行时 |
| 单次成本 | 近零 | 每断言一次视觉模型调用 | 每次探索多轮模型调用 |
| CI 适配 | 好（ubuntu 固定基线） | 需 secret + 非阻断 | 不适合 CI |
| 擅长 | 布局/主题/样式回归 | 「有没有出现某物/文案是否合理」 | 探索式找 bug、复现路径 |
| 数据边界 | 全本地 | 截图可能出网 | 截图与页面内容出网 |

### 5.2 选定分层

- **L1 为默认层（v4.15 实施）**：
  - 新增 `tests/e2e/visual-v414.spec.ts`，只覆盖稳定 2D 面：设置页、记忆面板、上下文洞察面板。
  - 明确排除 WebGL/VRM/Live2D、透明桌宠窗、会议舞台（GPU/字体/透明度不稳定）。
  - 基线只在 Linux/CI 生成并提交；本地默认跳过，`WBFM_VISUAL=1` 才跑。
  - `toHaveScreenshot(..., { animations: 'disabled', maxDiffPixelRatio: 0.02 })`。
  - CI 首月 `continue-on-error: true`，nightly 上传 diff 产物；稳定后转阻断。
- **L2 Midscene 为可选层（不默认引入依赖）**：
  - 仅 nightly `workflow_dispatch` + secret 存在时运行，非阻断。
  - 只做「语义存在性」断言，不做像素回归；优先本地 VLM（Ollama + 视觉模型），避免截图出网。
- **L3 Playwright MCP 仅人工**：
  - 写成人工 runbook：[visual-manual-runbook.md](./visual-manual-runbook.md)，用于探索式复现，不进产品依赖、不进 CI。

## 6. 决策 D4：`docs/plan` 按大版本归类

### 6.1 候选

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| A 索引层（选定） | 新增 `docs/plan/README.md`，按大版本分组列出目录链接 | 零断链、可立即落地 | 目录仍需按版本命名 |
| B 物理分区 | 移动到 `docs/plan/v4/v4.12` 等 | 目录树更整齐 | 64 处链接/30 个文件需批量改；历史提交路径失效 |
| C 归档移动 | 旧版本移到 `docs/plan/archive/` | 根目录更短 | 与 B 同样的断链风险，且破坏「vX.Y」直觉 |

### 6.2 选定：A

`docs/plan/README.md` 结构：

```text
v0 基础能力
  v0.8 / v0.9
v1 陪伴体验
  v1.0 / v1.1 / v1.2 / v1.3 / v1.4 / v1.6 / v1.7 / v1.8 / v1.9
  跨版本：v1.6-v2.0
v2 生态与治理
  v2.0 / v2.2 ... v2.34（含 v2.4-product-comparison）
  跨版本：v2.7-v2.10
v3 引擎化
  v3.0 / v3.1
v4 可靠性与产品化
  v4.0 ... v4.13 / v4.14
```

规则：

- 每个新版本目录必须在 `docs/plan/README.md` 增加一行，作为唯一索引。
- 嵌套专题不单独建索引，跟随所属版本目录进入（`v2.4-product-comparison/P0-*`、`v3.0/concepts|pet-engine|milestone-m4-m5`）。
- 版本目录内继续保留 `README.md` / `spec.md` / `tasks.md` / `progress-log.md` 的既有约定。
- 不移动、不改名现有目录；历史文档中的相对链接保持不变。

## 7. 本版执行范围（v4.14）

1. 新增 `docs/plan/v4.14/spec.md`（本文件）。
2. 新增 `docs/plan/v4.14/tasks.md`。
3. 新增 `docs/plan/README.md` 版本地图（覆盖全部子目录）。
4. `README.md` 的「文档」章节增加指向 `docs/plan/README.md` 的一行。
5. 不做代码改动；`event.fire` / `chat.request` 的删除与视觉基线留到 v4.15。

## 8. 验收

- `docs/plan/README.md` 中的链接全部可打开；`docs/plan` 下每个顶层子目录恰好在索引中出现一次。
- 索引分组与 `docs/roadmap/README.md` 的版本叙事不冲突。
- `pnpm check` 全绿（本版无代码改动，用于确认文档未触发门禁）。
- 提交并推送工蜂 `tencent`。

## 9. 风险与回退

| 风险 | 缓解 |
|---|---|
| 索引遗漏目录 | 用目录集合与索引集合做差集校验，CI 可选加脚本 |
| 后续新版本忘记加索引 | 在 `docs/plan/README.md` 顶部写明硬约定，并在 v4.15 计划中复核 |
| v4.15 删除动作变体影响未知调用方 | 全仓检索确认无生产方；shared 为内部包，无外部消费 |
| 截图基线在 Linux 生成、Windows 本地不一致 | 本地默认跳过；基线只在 CI 生成与比对 |
