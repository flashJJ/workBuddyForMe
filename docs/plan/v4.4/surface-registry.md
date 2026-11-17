# 表面层级登记表（Surface Registry）

> 配套方案：[surface-system.md](./surface-system.md)
> 状态：S1–S3 已完成（token/门禁 + 共享基座 + 设置/知识库/报告/助手），下表 `状态` 保留初版登记，迁移进度见 §8。
> 规则：L1 玻璃 + 模糊；L2–L5 透明度逐级升高，L5 实色，均不使用模糊。

## 1. 层级定义

| 层级 | Token | 说明 | 默认底色 |
|---|---|---|---|
| L0 | 背景自身 | 壁纸/视频/渐变 | 由背景解析器决定 |
| L1 | `bg-ui-canvas` / `bg-ui-chrome` | 工作区玻璃、侧边栏、浮动播放器 | 0.66 / 0.60 + 模糊（最透） |
| L2 | `bg-ui-card` | 页面头部、面板、卡片、列表容器、内容框 | 0.86 弱透明，无模糊 |
| L3 | `bg-ui-row` | 列表行、字段组、嵌套子块 | 0.92 更实 |
| L4 | `bg-ui-control` | 按钮、输入、下拉、开关、滑杆、标签页 | 0.96 接近实色 |
| L5 | `bg-ui-overlay` | 对话框、菜单、Toast、命令面板 | 实色 |

## 2. 全局布局

| 组件/元素 | 文件 | 当前类（抽样） | 层级 | 目标 token | 状态 |
|---|---|---|---|---|---|
| 主背景 | `features/background/background-layer.tsx` | 绝对定位媒体层 | L0 | — | 已实现 |
| 工作区玻璃 | `features/background/main-workspace-glass.tsx` | `app-workspace-glass` | L1 | `bg-ui-canvas` | 已实现 |
| 侧边栏 | `components/layout/app-sidebar.tsx` | `bg-card` + `app-glass-surface` | L1 | `bg-ui-chrome` | 待迁移 |
| 页面头部 | `components/layout/page-header.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 页面内容区 | `components/layout/page-header.tsx`（PageBody） | 无底色 | L1 | 透明（继承工作区） | 已实现 |
| 迷你播放器 | `features/music/music-mini-player.tsx` | `bg-card/95` + `app-glass-surface` | L1 | `bg-ui-chrome` | 待迁移 |
| 跳转链接 | `components/layout/skip-link.tsx` | `bg-primary` | L4 | 保持品牌色 | 白名单 |

## 3. 共享组件

| 组件/变体 | 文件 | 当前类（抽样） | 层级 | 目标 token | 状态 |
|---|---|---|---|---|---|
| Card | `components/ui/card.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| EmptyState | `components/common/state.tsx` | 仅 `border-dashed`，无底色 | L2 | `bg-ui-card` | 待迁移 |
| ErrorState | `components/common/state.tsx` | 无底色 | L2 | `bg-ui-card` | 待迁移 |
| Skeleton | `components/common/state.tsx` | `bg-muted` | L3 | `bg-ui-row` | 待迁移 |
| Button / primary | `components/ui/button.tsx` | `bg-primary` | L4 | 品牌色 | 白名单 |
| Button / secondary | `components/ui/button.tsx` | `bg-secondary` | L4 | `bg-ui-control` | 待迁移 |
| Button / outline | `components/ui/button.tsx` | `bg-background` | L4 | `bg-ui-control` | 待迁移 |
| Button / ghost | `components/ui/button.tsx` | 透明 + hover accent | L4 | `bg-transparent` | 白名单 |
| Input / Textarea | `components/ui/input.tsx` 等 | `bg-background` | L4 | `bg-ui-control` | 待迁移 |
| Select trigger | `components/ui/select.tsx` | `bg-background` | L4 | `bg-ui-control` | 待迁移 |
| Select menu | `components/ui/select.tsx` | `bg-popover` | L5 | `bg-ui-overlay` | 待迁移 |
| Dialog | `components/ui/dialog.tsx` | `bg-surface-3` | L5 | `bg-ui-overlay` | 待迁移 |
| Toast | `components/common/toast.tsx` | `bg-popover` | L5 | `bg-ui-overlay` | 待迁移 |
| Badge | `components/ui/badge.tsx` | 变体色 | L3 | 状态色 | 白名单 |
| 表格容器 / 行 | 各模块 | `bg-card` / 无底色 | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |

## 4. 模块登记

| 模块 | 组件/元素 | 文件 | 当前类（抽样） | 层级 | 目标 token | 状态 |
|---|---|---|---|---|---|---|
| 设置 | 设置搜索区 | `features/settings/base/settings-page.tsx` | `bg-card` + `rounded-lg p-4` | L2 | `bg-ui-card` | 已完成（单层方案） |
| 设置 | 右侧分组导航 | 同上 | 无底色 | L1 | 透明轨道 | 待确认 |
| 设置 | 面板容器 | `features/settings/**` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 设置 | 字段组/子块 | `features/settings/**` | `bg-muted/30`、`bg-background/60` | L3 | `bg-ui-row` | 待迁移（57 处 muted） |
| 知识库 | 知识库侧栏 | `features/knowledge/knowledge-page.tsx` | `bg-muted/30` | L2 | `bg-ui-card` | 待迁移 |
| 知识库 | 文档列表容器 | `features/knowledge/document-list.tsx` | `rounded-lg border`，无底色 | L2 | `bg-ui-card` | 待迁移 |
| 知识库 | 上传拖拽区 | `features/knowledge/upload-dropzone.tsx` | 虚线边框，无底色 | L2 | `bg-ui-card` | 待迁移 |
| 知识库 | 编译工具栏 | `features/knowledge/compile-toolbar.tsx` | 无底色 | L2 | `bg-ui-card` | 待迁移 |
| 运行报告 | KPI 卡片 | `features/reports/run-report-page.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 运行报告 | 筛选栏 | 同上 | 无底色（仅控件） | L2 | `bg-ui-card` | 待迁移 |
| 运行报告 | 空态 | 同上 | `EmptyState` | L2 | `bg-ui-card` | 待迁移 |
| 助手 | 模板启动器/模板卡 | `components/common/template-*.tsx` | 仅边框，无底色 | L2 | `bg-ui-card` | 待迁移 |
| 助手 | 助手卡片 | `features/assistants/assistant-card.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 能力包 | 能力行 | `features/capabilities/capability-row.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 能力包 | 健康横幅/导入区 | `features/capabilities/**` | `bg-muted/30` | L2 | `bg-ui-card` | 待迁移 |
| 能力包 | 详情子块 | 同上 | `bg-muted/20` | L3 | `bg-ui-row` | 待迁移 |
| 对话 | 顶栏 | `features/chat/page/chat-header.tsx` | 无底色 | L2 | `bg-ui-card` | 待迁移 |
| 对话 | 会话侧栏 | `features/chat/sidebar/conversation-sidebar.tsx` | `bg-muted/30` | L2 | `bg-ui-card` | 待迁移 |
| 对话 | 消息气泡 | `features/chat/message/message-item.tsx` | `bg-muted` | L3 | `bg-ui-row` | 待迁移 |
| 对话 | 推荐卡 | `features/chat/message/message-list.tsx` | `bg-surface-2` | L3 | `bg-ui-row` | 待迁移 |
| 对话 | 菜单 | `features/chat/page/chat-header.tsx` | `bg-popover` | L5 | `bg-ui-overlay` | 待迁移 |
| 任务 | 新建表单 | `features/tasks/task-start-form.tsx` | `bg-card/50` | L2 | `bg-ui-card` | 待迁移 |
| 任务 | 任务行 | `features/tasks/task-row.tsx` | `bg-card` | L3 | `bg-ui-row` | 待迁移 |
| 计划 | 计划卡/芯片 | `features/plans/**` | `bg-card` / `bg-muted` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 会议 | 列表卡/房间列 | `features/meetings/**` | `bg-card` / `bg-muted/30` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 审批 | 审批卡 | `features/approvals/approvals-page.tsx` | `bg-card` | L2 | `bg-ui-card` | 待迁移 |
| 审计 | 事件表/详情块 | `features/audit/audit-page.tsx` | `bg-muted/30` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 时间线 | 列表卡/JSON 块 | `features/timeline/timeline-page.tsx` | `bg-card` / `bg-muted` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 工作流 | 运行表/行 | `features/flows/flow-runs-view.tsx` | `bg-card` / `hover:bg-muted` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 流程编辑器 | 配置面板/节点面板 | `features/flow-editor/panels/config-panel.tsx` 等 | `bg-card/40` | L2 | `bg-ui-card` | 待迁移 |
| 流程编辑器 | 诊断浮层 | `features/flow-editor/panels/diagnostics-bar.tsx` | `bg-card/95` | L5 | `bg-ui-overlay` | 待迁移 |
| 语音 | 设置面板/子块 | `features/voice/**` | `bg-card` / `bg-muted` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 音乐 | 曲库/氛围面板 | `features/music/**` | `bg-card` / `bg-muted` | L2 / L3 | `bg-ui-card` / `bg-ui-row` | 待迁移 |
| 日常回眸 | 列表卡/空态 | `features/pet-journal/pet-journal-page.tsx` | `bg-card` / `EmptyState` | L2 | `bg-ui-card` | 待迁移 |
| 文档查看器 | 对话框/面板 | `features/document-viewer/**` | `bg-surface-3` / `bg-muted` | L5 / L3 | `bg-ui-overlay` / `bg-ui-row` | 待迁移 |
| 舞台/小剧场 | 沉浸层/工具栏 | `features/stage/**` | `bg-black/*`、`bg-white/*` | 白名单 | — | 白名单（沉浸式深色） |
| 桌宠窗 | 字幕/气泡 | `features/pet/**` | `bg-background/80~88` | 白名单 | — | 白名单（透明窗专用） |

## 5. 存量违例（首批）

| 位置 | 违例 | 目标处理 |
|---|---|---|
| `features/settings/**`（57 处） | `bg-muted/xx` 子块、`bg-background/60` 字段组 | L3 → `bg-ui-row` |
| `features/settings/base/settings-page.tsx` | 右侧导航无底色 | 确认 L1 透明轨道 |
| `features/knowledge/document-list.tsx` | 列表容器仅边框 | L2 → `bg-ui-card` |
| `features/knowledge/upload-dropzone.tsx` | 虚线区无底色 | L2 → `bg-ui-card` |
| `features/tasks/task-start-form.tsx` | `bg-card/50` | L2 → `bg-ui-card` |
| `features/flow-editor/panels/config-panel.tsx` | `bg-card/40` | L2 → `bg-ui-card` |
| `features/flow-editor/canvas/node-palette.tsx` | `bg-card/40` | L2 → `bg-ui-card` |
| `features/chat/message/message-item.tsx` | `bg-muted` 气泡 | L3 → `bg-ui-row` |
| `features/chat/message/message-list.tsx` | `bg-surface-2` 推荐卡 | L3 → `bg-ui-row` |
| `features/music/music-mini-player.tsx` | `bg-card/95` | L1 → `bg-ui-chrome` |
| `features/reports/run-report-page.tsx` | 筛选栏无容器底色 | L2 → `bg-ui-card` |
| `components/common/state.tsx` | 空态/错误态无底色 | L2 → `bg-ui-card` |
| `components/common/template-*.tsx` | 模板卡/入口仅边框 | L2 → `bg-ui-card` |
| `features/meetings/**`、`features/tasks/**`、`features/audit/**` | `bg-muted/xx` 子块 | L3 → `bg-ui-row` |

## 6. 扫描统计（当前）

`check:surfaces` 门禁口径（card / background / surface / popover / muted，不含测试与白名单）：**330 处 / 170 个文件**，按模块 Top 8：

```text
features/settings 119，features/chat 25，features/flow-editor 22，features/meetings 18，
features/reminders 11，features/knowledge 10，components/ui 8，features/tasks 8
```

按模块的细分统计（不含测试文件，含 accent 等状态色）：

| 模块 | 合计 | card | background | muted | surface | popover | accent |
|---|---:|---:|---:|---:|---:|---:|---:|
| settings | 123 | 33 | 29 | 57 | 0 | 0 | 4 |
| chat | 31 | 0 | 4 | 18 | 2 | 1 | 6 |
| flow-editor | 24 | 6 | 7 | 9 | 0 | 0 | 2 |
| meetings | 20 | 7 | 9 | 2 | 0 | 0 | 2 |
| music | 16 | 3 | 0 | 2 | 0 | 0 | 11 |
| components/ui | 14 | 1 | 5 | 0 | 1 | 1 | 4 |
| knowledge | 13 | 0 | 5 | 5 | 0 | 0 | 3 |
| reminders | 11 | 1 | 7 | 3 | 0 | 0 | 0 |
| onboarding | 10 | 0 | 2 | 4 | 0 | 0 | 4 |
| voice | 10 | 1 | 2 | 5 | 0 | 0 | 2 |
| 其余模块 | ≤9 | — | — | — | — | — | — |

结论：`settings` 一个模块占了近三分之一，且 `muted` 用法最多；先迁设置、知识库、对话三块，能覆盖大部分视觉问题。

## 7. 验收口径

1. 登记表中每个 L2 及以下组件都有唯一 token；
2. 业务代码不再出现 `bg-card/xx`、`bg-background/xx`、`bg-surface-*/xx`；
3. 整屏模式下 L2–L5 逐级更实，L5 实色；L2 及以下不叠模糊；
4. 明/暗主题、五个主题组合的截图检查通过；
5. `check:surfaces` 存量基线只降不升。

## 8. 迁移进度

| 阶段 | 范围 | 结果 |
|---|---|---|
| S1 | token、Tailwind `ui.*`、`check:surfaces` | ✅ 基线 330 处 / 170 文件 |
| S2 | Card、Button（outline）、Input、Textarea、NumberInput、Select、Dialog、Toast、EmptyState、ErrorState | ✅ 已切 `bg-ui-*` |
| S3 | Sidebar、PageHeader、Settings、Knowledge、Reports、Assistants、模板卡 | ✅ 完成；基线 330 → 232 处，settings 119 → 48 |
| S4 | Chat、Tasks、Plans、Meetings、Audit、Timeline、Flows、Flow Editor、Voice、Music、Journal、Approvals、Document Viewer | 待开始 |
| S5 | 兼容层移除、基线清零、文档与博客 | 待开始 |
