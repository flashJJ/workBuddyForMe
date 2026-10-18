# v2.3 方案：用起来顺手——交互控件统一、窄窗可用与开箱即用内容

> 主题一句话：**把「能用」打磨成「顺手」**——下拉不再是系统原生那个挤成一团的样子、窄窗文字不再变形、第一次打开就有现成的知识与流程可用、MCP 与技能有地方加载。
>
> 编号 **v2.3**（上一正式版为 v2.2.0）。本版是**体验补课版**：不改后端能力口径，专注前端交互一致性、响应式与「开箱即用」内容。
>
> 本版不做整体换肤，沿用既有设计 token；不引入新 UI 库（`@radix-ui/react-select` 早已是依赖，只是没被组合成组件——见第 2 节）。
>
> 现状证据来源：用户真机截图 2 张（助手头部下拉、桌面任务表单） + 代码走查。截图现象已逐条落到具体控件，见 [01-现状取证.md](01-现状取证.md)。

## 1. 版本主题与目标

**价值主张**：让 WorkBuddy 从「功能都有」升级到「每一步都顺手」——控件语言统一、任何窗口尺寸都不变形、首启就有可以立刻用的内容。

**成功指标（可验收）**：

| 指标 | 现状 | 目标 |
|---|---|---|
| 下拉控件一致性 | 两套并存：`components/ui/select.tsx` 是原生封装，另有 13 个文件裸用 `<select>` | 全仓 **0 处裸 `<select>`**，统一走一个基于 Radix 的 `Select` |
| 数值输入手感 | 11 个文件裸用 `type="number"`（浏览器原生 spinner） | 全仓 **0 处裸 `type="number"`**，统一走 `NumberInput`（步进器/滑杆） |
| 窄窗可用性 | 侧栏固定 `w-56` 无折叠、多处固定宽/固定网格列，小窗文字挤压 | 主窗缩到最小尺寸下 **无横向滚动、无文字重叠**，侧栏可折叠、表单纵向堆叠 |
| 知识库开箱即用 | 零内置内容（`services/seed.ts` 不播种任何 KB） | 首启播种 **≥2 个示例知识库** + 新建时「从模板创建」 |
| 工作流现成选项 | 已有 3 个内置 starter（`starters.ts`），但列表空态未说明来源 | starter **扩容到 ≥6**，列表页说明并给「模板」入口 |
| MCP / 技能入口 | MCP 只能手填命令；技能面板只列不导；无助手级技能绑定 | MCP **预置目录一键添加**；技能**导入入口**；口径与助手绑定澄清 |
| 门禁 | 全绿 | 不降级：`pnpm check`（typecheck/lint/行数）、`pnpm test` 全绿，i18n zh+en 双份 |

## 2. 现状与痛点

四个痛点全部来自真机截图与代码走查，逐条给根因。

### 2.1 选择框「不优雅、没间距、生硬」的根因：装了库但没用

- `apps/web/package.json` 里 **`@radix-ui/react-select@^2.1.2` 早就是依赖**，但从未被组合成组件；
- 实际的 [select.tsx](../../../apps/web/src/components/ui/select.tsx) 只是**原生 `<select>` 的样式封装**（文件注释即写「原生 select 封装」）——下拉面板由操作系统渲染，**我们无法控制选项内边距、行距、悬停/选中高亮**。这就是截图里「选项挤在一起、生硬蓝高亮」的直接原因；
- 更糟的是**两套并存**：除封装外，还有 **13 个文件裸用 `<select>`**（settings 6 个、events 2 个、stage 2 个、flow-editor 1 个、flows 1 个、reminders 1 个），同一个应用里下拉风格必然不一致。

**截图落点**：

- 截图①「当前助手 → 通用助手」= [assistant-switcher.tsx](../../../apps/web/src/features/chat/assistant-switcher.tsx) 的 `<Select className="h-8 w-44">`；
- 截图②「接管会话 / 全部状态」= [task-page.tsx](../../../apps/web/src/features/tasks/task-page.tsx) 等的 `<Select>`。

### 2.2 数字选择「生硬」的根因：裸用浏览器原生 spinner

- 截图②「步数上限」= [task-page.tsx:114-129](../../../apps/web/src/features/tasks/task-page.tsx#L114-L129) 的 `<Input type="number" className="w-20">`：原生上下小箭头、点击生硬、无步进反馈、`w-20` 固定宽在小窗被压；
- [number-field.tsx](../../../apps/web/src/features/assistants/number-field.tsx) 也只是薄封装，仍走原生 spinner；
- 全仓 **11 个文件**裸用 `type="number"`（settings 3、flow-editor 3、assistants 1、events 1、knowledge 1、stage 1、tasks 1）。

### 2.3 小窗「文字挤压变形」的根因：固定宽 + 无响应式断点

- [app-sidebar.tsx](../../../apps/web/src/components/layout/app-sidebar.tsx) 固定 **`w-56`（224px）且无折叠**；[(main)/layout.tsx](../../../apps/web/src/app/(main)/layout.tsx) 的 `<main>` 是 `flex-1`——小窗时侧栏先吃掉 224px，主区被压到变形；
- [task-page.tsx:90](../../../apps/web/src/features/tasks/task-page.tsx#L90) `md:grid-cols-[260px_1fr_auto]`：固定 260px 列 + `auto` 列里塞输入框和按钮，窄于 `md` 虽会堆叠，但列内仍会挤；
- [scenario-model-matrix.tsx:26](../../../apps/web/src/features/tuning/scenario-model-matrix.tsx#L26) `grid-cols-[10rem_1fr]`：**没有任何断点**，永远 160px 固定标签列；
- [assistant-switcher.tsx](../../../apps/web/src/features/chat/assistant-switcher.tsx) `w-44` 固定宽；
- 全仓几乎**没有响应式断点**（仅 task-page 一处 `md:`、flows-list 一处 `sm:/xl:`），无容器查询，`whitespace-nowrap` 仅在 button 上出现一次——说明排版从一开始就不是按「可变窗口」设计的。

### 2.4 知识库 / 工作流「开箱即用」的现状：一半有、一半空

| 能力 | 现状 | 结论 |
|---|---|---|
| 内置工作流 | ✅ 已有 3 个 starter（[starters.ts](../../../packages/core/src/flow/starters/starters.ts)：资料研究助手 / 周报流水线 / 网页摘要器），由 [container.ts:212](../../../apps/web/src/lib/server/container.ts#L212) 调 `ensureStarterFlows` 幂等播种并发布 | 有基础，但**只有 3 个、列表空态未告知来源**，用户感知不到「现成选项」 |
| 内置技能 | ✅ 已有 3 个（[builtin-skills.ts](../../../packages/core/src/skills/builtin-skills.ts)：weekly-report / meeting-notes / file-search），[skill-service.ts:74](../../../packages/core/src/skills/skill-service.ts#L74) 首启播种到磁盘 `skills/` | 有基础，但**面板只列不导**，无模板库/导入入口 |
| 内置知识库 | ❌ [seed.ts](../../../packages/core/src/services/seed.ts) **不播种任何知识库** | **明显缺口**：空态只让「创建知识库」，用户要自己建库+传文档，零开箱即用 |

**既有范式可对齐**：内置角色卡 [built-in-cards.ts](../../../packages/shared/src/character-card/built-in-cards.ts) 已是「固定 id + 幂等播种 + 不覆盖用户改动」的成熟做法，本版新增内置内容沿用同一策略。

### 2.5 MCP / 技能「没有加载的地方」的现状

- **MCP**：仅设置页 [mcp-panel.tsx](../../../apps/web/src/features/settings/mcp-panel.tsx) 的「添加服务器」**手动填写命令与参数**，**无预置目录**（filesystem / fetch / git / sqlite 等常见服务器没有一键添加）；
- **技能**：仅设置页 [skills-panel.tsx](../../../apps/web/src/features/settings/skills-panel.tsx) **列表 + 全局启停 + 删除**，**无导入入口**；
- **助手侧**：[assistant-form-dialog.tsx](../../../apps/web/src/features/assistants/assistant-form-dialog.tsx) + [assistant-tools-field.tsx](../../../apps/web/src/features/assistants/assistant-tools-field.tsx) 只有**工具级** `enabledTools`（含 MCP 工具），**没有助手级技能绑定**——但内置技能描述写的是「再让助手启用本技能」，**文案口径与实现不一致**；
- **对话内**：没有任何地方能看到「当前助手挂了哪些 MCP / 技能」。

## 3. 功能清单

### P0 必做

**P0-1 统一下拉选择器（Radix Select 组件化 + 全量迁移）**

- 用户故事：我点开「当前助手」，选项之间有舒展的间距、选中高亮柔和、能用键盘打字筛选，和系统原生下拉完全不是一个观感。
- 验收：基于已安装的 `@radix-ui/react-select` 组合出 shadcn 风格 `Select`（Trigger / Content / Item / Group / Label / Separator）；选项有 padding、圆角，hover/selected 使用设计 token；**17 个使用点全部统一**（1 个封装 + 13 个裸 `<select>` + 其余用封装的），两套下拉归零；键盘与屏幕阅读器行为符合 WCAG（Radix 原生支持）。
- 技术要点：**空值语义适配是核心难点**——Radix Select 的 `value` 必须为非空字符串，而现有代码大量用 `value=""` 表示「未选择 / 跟随默认」（如 [scenario-model-matrix.tsx](../../../apps/web/src/features/tuning/scenario-model-matrix.tsx) 的 `nullLabel`）。做法：抽一个适配层把 `''`/`null` 映射到哨兵值（如 `__none__`）再转回，**必须有单测**。工作量：组件 + 适配 hook + 迁移 17 处。

**P0-2 统一数值输入（步进器 / 滑杆）**

- 用户故事：我调「步数上限」，可以直接输入也可以点 +/−，到上下限就停住，不再是浏览器那个生硬的小箭头。
- 验收：新增 `NumberInput`（减号 / 输入框 / 加号三件套，`min/max/step` 钳制；有界区间可选滑杆变体，用于轮播秒数 3–60、检索 topK 等）；全仓 **11 处裸 `type="number"` 迁移**，[number-field.tsx](../../../apps/web/src/features/assistants/number-field.tsx) 升级为它的特例；清空输入时不产生 `NaN`。
- 技术要点：保留可访问性（`role="spinbutton"`、`aria-valuenow/min/max`）；受控 + 本地草稿、失焦提交，避免逐字符触发网络写。工作量：组件 + 11 处迁移。

**P0-3 窄窗响应式（布局不再挤）**

- 用户故事：我把主窗拖窄，侧边栏自动收起，表单自动换行，文字不重叠、不不截断变形。
- 验收：主窗缩到最小尺寸（约定下限，如 720×520）下：① 侧栏可折叠为图标态（tooltip 兜底）且不覆盖主区；② 固定宽改弹性（`w-44`→`min-w-0` 参与 flex、`grid-cols-[10rem_1fr]` 加窄断点或改 `minmax`）；③ 表单标签/控件不再贴边；④ **无横向滚动条**。E2E 覆盖 3 个窗口尺寸截图对比。
- 技术要点：统一断点策略（复用 Tailwind 默认 sm/md/lg，必要时加 `@container` 容器查询）；侧栏折叠状态持久化到设置。工作量：布局基座 + 关键面板逐个改（task-page / scenario-model-matrix / assistant-switcher / 各设置面板）。

**P0-4 知识库开箱即用（示例模板）**

- 用户故事：我第一次打开知识库，就有「产品需求 / 会议纪要 / 研究资料」等可选的库，还能一键套模板新建。
- 验收：首启播种 **≥2 个示例知识库**（固定 id、幂等、用户改名/删除后不复活覆盖，对齐 `ensureStarterFlows` 策略）；新建知识库对话框提供「**从模板创建**」（模板 = 预置名称/描述/推荐分块参数，可选是否带一份极小样本文档）；列表空态文案改为「已为你准备了 N 个示例库」。
- 技术要点：新增 `ensureStarterKnowledgeBases`（放 core，可由服务容器启动时调用）；模板定义放 shared 常量；**注意备份体积**——模板默认不带文档或只带极小样本。

**P0-5 MCP / 技能入口补齐**

- 用户故事：我想加 filesystem 能力，不用去查命令，从预置列表一键添加；我也能一眼看到当前助手挂了哪些能力。
- 验收：① MCP 面板增加「**预置目录**」（filesystem / fetch / git 等常见服务器，含推荐命令、参数占位、说明、风险标注），一键填入表单；② 技能面板增加「**内置技能模板**」区（展示 3 个内置 + 说明）与「**导入**」入口（选择本地技能包目录/文件）；③ **口径澄清**：要么补助手级技能选择，要么把「让助手启用本技能」文案改为全局口径（见下条取舍）；④ 对话内助手头部显示当前助手已挂载的技能/MCP 数量（hover 列出）。
- 技术要点：预置目录放 shared 常量（对齐 [constants/tools.ts](../../../packages/shared/src/constants/tools.ts) 的组织方式）；技能导入复用既有 skill-service 的校验与播种逻辑。工作量：目录常量 + 两个面板 UI + 头部指示。

### P1 争取

- **P1-1 统一表单排版规范**：抽 `FormField`（label + 控件 + hint + error 统一间距，`space-y-1.5`），消除截图里「任务目标」标签紧贴控件的现象，全仓表单改用它。
- **P1-2 模板扩容**：工作流 starter 3 → **6+**（如会议纪要整理 / 竞品对比 / 定时摘要），知识库模板与技能模板同步扩容。
- **P1-3 MCP 预置目录增强**：添加后「一键测试连接」，失败给出排查提示。
- **P1-4 设计 token 收敛**：梳理 spacing / radius / typography token 形成约束（含深色对比度回归），杜绝再次跑偏。

### P2 留白

- **P2-1 组件清单文档**：把统一后的 `Select`/`NumberInput`/`FormField` 建档，防止后续再裸用原生控件。
- **P2-2 微交互**：下拉展开过渡、按钮按压反馈——需控性能风险，视时间。
- **P2-3 助手级技能绑定**：若 P0-5 评估发现成本可接受，则从「口径澄清」升级为真正实现（见第 6 节取舍）。

## 4. 架构影响

| 层 | 变化 |
|---|---|
| shared | 新增：MCP 预置目录常量、知识库模板常量、更多 flow starter 常量的组织；新增表单/控件的公共类型 |
| core | 新增 `ensureStarterKnowledgeBases`（播种知识库模板）；`STARTER_FLOWS` 扩容；技能播种策略保持 |
| database | 知识库播种走既有仓储，**无需迁移**；若做助手级技能绑定（P2）则需一次纯加法迁移 + 备份轨道同步 |
| web | 新组件 `Select`（Radix）/`NumberInput`/`FormField`；迁移 17 处下拉 + 11 处数值输入；侧栏折叠；关键面板响应式；MCP 预置目录 UI；技能导入 UI；助手头部能力指示 |
| desktop | 侧栏折叠/窗口尺寸记忆；主窗最小尺寸约定（若需要） |
| i18n | 所有新增文案 **zh + en 双份**（[parity.test.ts](../../../packages/shared/src/i18n/parity.test.ts) 强制） |

## 5. 里程碑拆分

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 基座 | Radix `Select` + `NumberInput` + `FormField` 三件套；空值适配层；断点/ token 策略确认 | 组件单测通过（含空值适配、钳制、a11y），旧 `Select` 有兼容路径 |
| M1 全量迁移 | 13 处裸 `<select>` + 4 处封装用法 + 11 处裸 `type="number"` 迁移到新组件 | 全仓裸控件归零；交互回归无遗漏 |
| M2 窄窗响应式 | 侧栏折叠 + task-page / scenario-model-matrix / assistant-switcher / 设置面板断点改造 | 最小尺寸无横向滚动、无文字重叠；E2E 三尺寸截图 |
| M3 开箱即用 | 知识库模板播种 + starter 扩容 + MCP 预置目录 + 技能导入/模板区 + 口径澄清 | 首启即有可用内容；添加路径可一键完成 |
| M4 收口 | i18n 双份补齐、`pnpm check` / `pnpm test` 全绿、真机三尺寸验收、行数门禁（新组件 ≤300 行） | 全门禁绿；截图与验收记录归档 |

> 质量预埋：本版新增/改动文件多，需持续守 300 行硬门禁；组件尽量拆小（`Select` 的 item/trigger 可拆）。

## 6. 风险与取舍

- **Radix Select 空值语义**：`value` 必须非空，而现有代码用 `''` 表示「未选择/跟随默认」。取舍：**不做全局改写既有语义**，改用适配层映射哨兵值，并以单测锁死；迁移面大（17 处）逐文件回归，不一次性批量替换。
- **助手级技能绑定是否做**：真正实现需动数据模型 + 备份轨道，成本明显高于「补入口」。取舍：**本轮先做「预置目录 + 导入入口 + 头部能力指示」，并把「让助手启用本技能」文案改为全局口径**；助手级绑定列 P2，视 M4 余量决定是否上提。
- **知识库模板带样本文档会膨胀备份**：取舍：模板**默认不带文档**（或只带一份极小样本），把「填内容」留给用户。
- **响应式改造触及主布局**：取舍：**只做「窄窗到合理下限」的适配，不做移动端**；改造后必须回归 a11y（侧栏折叠后的焦点顺序、skip link）。
- **不换 UI 库**：`@radix-ui/react-select` 已在依赖里，增量 bundle 小；**不引入 Storybook / 新组件库 / 换 Tailwind**，避免大改造。
- **一致性 vs 破坏既有行为**：统一控件时若顺手改了交互语义（如默认值、提交时机），风险高。取舍：**只换皮与手感，不改业务语义**，除非有明确验收项。

## 7. Non-Goals（本版明确不做）

- **不重做整体视觉/品牌**：不引入新配色体系、不换设计语言，沿用现有 token（仅做收敛与一致性）；
- **不引入新 UI 库或组件文档平台**：只用仓库已安装的 Radix 组件，不装 Storybook；
- **不做移动端适配**：桌面应用，仅把窄窗优化到合理下限，不追小平板/手机；
- **不做在线模板市场 / 云同步**：模板与内置内容全部本地，本地优先不动摇；
- **不改知识库检索算法与 embedding**：v1.3 的编译式 RAG、混合检索、语句级引用口径保持；
- **不做助手级技能绑定的数据模型大改**（本轮）：仅补入口 + 澄清口径，绑定列 P2；
- **不放开既有红线**：外部 Live2D 模型导入、无人值守 desktop 等边界不变；
- **不改 MCP/技能的校验与安全口径**：只加「预置目录 / 导入入口」，权限确认与黑名单策略不变。

---

## 附：现状取证索引（详见 [01-现状取证.md](01-现状取证.md)）

- 下拉控件：`@radix-ui/react-select` 已装未用（[package.json](../../../apps/web/package.json)）；封装 [select.tsx](../../../apps/web/src/components/ui/select.tsx) 为原生；13 处裸 `<select>`。
- 数值输入：11 处裸 `type="number"`；[number-field.tsx](../../../apps/web/src/features/assistants/number-field.tsx) 薄封装。
- 窄窗：侧栏 [app-sidebar.tsx](../../../apps/web/src/components/layout/app-sidebar.tsx) `w-56` 无折叠；[task-page.tsx:90](../../../apps/web/src/features/tasks/task-page.tsx#L90)、[scenario-model-matrix.tsx:26](../../../apps/web/src/features/tuning/scenario-model-matrix.tsx#L26) 固定网格列。
- 开箱即用：工作流 [starters.ts](../../../packages/core/src/flow/starters/starters.ts) 3 个；技能 [builtin-skills.ts](../../../packages/core/src/skills/builtin-skills.ts) 3 个；知识库 [seed.ts](../../../packages/core/src/services/seed.ts) 零播种。
- MCP / 技能入口：[mcp-panel.tsx](../../../apps/web/src/features/settings/mcp-panel.tsx) 手填；[skills-panel.tsx](../../../apps/web/src/features/settings/skills-panel.tsx) 只列；[assistant-form-dialog.tsx](../../../apps/web/src/features/assistants/assistant-form-dialog.tsx) 仅工具级绑定。

## 8. 交付状态（M0–M3 已落地）

### 8.1 已交付

| 里程碑 | 内容 | 代码锚点 |
|---|---|---|
| M0 基座 | Radix 组合式 `Select`（Trigger/Content/Item/Group/Label/Separator）、`SimpleSelect`（原生语义外观层 + 空值哨兵适配）、`NumberInput`（步进器 + `allowEmpty`）、`FormField`；common 命名空间新增 `controls` 文案 | [select.tsx](../../../apps/web/src/components/ui/select.tsx)、[simple-select.tsx](../../../apps/web/src/components/ui/simple-select.tsx)、[number-input.tsx](../../../apps/web/src/components/ui/number-input.tsx)、[form-field.tsx](../../../apps/web/src/components/ui/form-field.tsx)、[common.ts](../../../packages/shared/src/i18n/messages/common.ts) |
| M1 全量迁移 | 26 个文件：裸 `<select>` 13 处 + 导入旧 `Select` 18 处 + 裸 `type="number"` 11 处，全部改走统一组件；`components/ui/select.tsx` 由原生封装升级为 Radix 组合原语 | 见各 feature 目录；`Grep '<select' / 'type="number"' / "ui/select"` 在业务代码中归零 |
| M2 窄窗响应式 | 侧栏 `<768px` 自动折叠为图标态（`w-14 md:w-56` + `hidden md:inline`）；task-page 网格改 `lg:grid-cols-[260px_minmax(0,1fr)_auto]` 且按钮/数值框 `shrink-0`；场景模型矩阵改 `sm:grid-cols-[10rem_minmax(0,1fr)]`；助手切换器改 `min-w-0 max-w-[12rem]` | [app-sidebar.tsx](../../../apps/web/src/components/layout/app-sidebar.tsx)、[task-page.tsx](../../../apps/web/src/features/tasks/task-page.tsx)、[scenario-model-matrix.tsx](../../../apps/web/src/features/tuning/scenario-model-matrix.tsx)、[assistant-switcher.tsx](../../../apps/web/src/features/chat/assistant-switcher.tsx) |
| M3 开箱即用 | 内置知识库模板 3 个（固定 id 幂等播种）+ 新建弹窗「从模板开始」；工作流 starter 3 → 6（会议纪要整理 / 竞品对比 / 知识库问答）；MCP 预置目录 4 个（filesystem/fetch/git/memory）一键填入表单；技能面板「重新扫描」（`POST /api/skills` → reconcile）+ 全局口径文案 | [knowledge-starters.ts](../../../packages/shared/src/constants/knowledge-starters.ts)、[seed-starter-knowledge-bases.ts](../../../packages/core/src/knowledge/seed-starter-knowledge-bases.ts)、[container.ts](../../../apps/web/src/lib/server/container.ts)、[starters.ts](../../../packages/core/src/flow/starters/starters.ts)、[mcp-presets.ts](../../../packages/shared/src/constants/mcp-presets.ts)、[mcp-panel.tsx](../../../apps/web/src/features/settings/mcp-panel.tsx)、[skills/route.ts](../../../apps/web/src/app/api/skills/route.ts) |

**门禁**：`pnpm check` 8/8（typecheck 通过、lint 0 error、行数门禁通过）；`pnpm test` 8/8（web 507、shared 314、core、database、desktop 164 全绿）。

### 8.2 与计划的取舍差异（实现时定稿）

- **Radix Select 采用 `item-aligned` 定位（非 popper）**：`position="popper"` 依赖 Radix Popper 的持续 rAF 测量循环，在 jsdom 下会让下拉相关测试从 ~0.2s 涨到 ~34s 甚至超时；改用 Radix 默认的 `item-aligned` 后交互与视觉等效而测试恢复正常。组件仍保留 `position` prop 可覆写。
- **侧栏折叠用 CSS 断点自动折叠，未做「手动折叠 + 持久化」**：更简单、无需新增设置项；<768px 即图标态（`title` 提供可访问名）。
- **技能侧落地为「重新扫描」而非「导入本地技能包」**：技能本就是数据目录 `skills/` 下的文件夹，`reconcile` 即可加载（无需重启），避免引入上传落盘的安全面。
- **助手级技能绑定仍未做（P2）**：按计划先把面板文案改为「全局启停」口径，绑定留后续版本。
- **知识库模板默认不带样本文档**（按第 6 节取舍），只预填名称/说明/推荐分片参数。
- **`NumberInput` 增加 `allowEmpty`**：保住模型 `contextWindow` 等「可空数值」字段的既有语义（空 = 未设置），避免迁移把「未设置」压成 0。

### 8.3 留白项补齐情况（本轮已补）

| 留白项 | 状态 | 落点 |
|---|---|---|
| E2E 三尺寸截图（M2 出口） | ✅ 已补 | [responsive-v23.spec.ts](../../../tests/e2e/responsive-v23.spec.ts)：1280/900/720 三档断言无横向滚动 + 主内容可见；截图输出 `test-results/responsive/` |
| 窄窗 <768px 侧栏折叠验收 | ✅ 已自动化 | 同上用例中窄档断言品牌与导航文案隐藏、图标栏保留；/tasks 另断言步进器数字不被裁。真机手动复核改为可选 |
| P1-3 MCP 一键测试连接 | ✅ 已补 | core `McpRegistry.testServer`（重连并等待终态）+ `POST /api/mcp/servers/[id]/test` + 面板每行「测试连接」按钮与结果提示 |
| P1-1 表单排版收敛 | 🚧 部分落地 | 对话框与设置表单已改用 `FormField`（flow-form-dialog / mcp-server-form-dialog）；其余面板后续逐步替换 |
| P1-4 设计 token 文档 | ✅ 已补 | [docs/design/tokens.md](../../design/tokens.md)：颜色令牌表、圆角·间距·字号约定、统一控件清单与三条硬约束、响应式与 a11y 底线 |

仍待办：表单排版收敛的全量替换（其余设置面板与页面表单）；`docs/roadmap` 的 v2.3 登记与版本号 bump / tag / Release 走正式发布流程时才做。
