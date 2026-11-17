# 表面层级治理方案（Surface System）

> 目标：把页面、容器、列表、控件、弹层的底色收敛成一套可登记、可检查、可全局切换的层级系统，解决“有的透、有的实、换主题就漂移”的问题。
> 参考：Radix Themes `panelBackground`、Fluent Acrylic、Material elevation overlay。
> 状态：方案待评审（未开始实施）。

## 1. 为什么现在要做

v4.4 背景能力上线后，整屏模式下暴露出一类反复出现的问题：

- 同一页面里，有的卡片是实色，有的是半透明，有的列表/内容框完全没有底色；
- 同一层级的两个组件，一个写 `bg-card`，另一个写 `bg-card/40`，视觉权重不同；
- 亮色主题白卡半透明、暗色主题深卡半透明，观感差异明显；
- 改一个地方只能解决一个页面，下一张截图又出现新的遗漏。

根因不是透明度数值，而是**缺少层级契约**：每个组件各自决定“我该多透”，没有统一登记与门禁。此前动效库也是同样的问题——单点修改会互相影响，最后靠统一资产库和门禁控制住。本次沿用同一思路。

## 2. 目标与非目标

### 2.1 目标

1. 建立 L0–L5 六级表面层级，每个组件都能登记到唯一层级；
2. 每级只对应一个语义 token，组件不再直接写 `bg-card/xx` 这类局部透明度；
3. 玻璃（半透明 + 模糊）只在 L1 出现；L2–L5 透明度逐级升高，L5 为实色，保留层级感；
4. 主题只分「明/暗」两套 token 值，命名主题不再逐套调透明度；
5. 新增 `check:surfaces` 门禁，冻结存量、阻止新增裸表面类；
6. 形成可维护的登记表，后续新增页面按表登记即可。

### 2.2 非目标

- 不改交互与信息架构；
- 不引入组件库或 CSS-in-JS；
- 不做逐像素视觉回归平台（先用截图清单人工验收）；
- 不在本专项里重做主题色板。

## 3. 层级模型

| 层级 | 名称 | 用途 | 是否透明 | 典型组件 |
|---|---|---|---|---|
| L0 | Backdrop | 壁纸/视频背景 | 背景本身 | `BackgroundLayer` |
| L1 | Workspace / Chrome | 主工作区玻璃、侧边栏、浮动播放器 | 是：玻璃 + 模糊（最透） | `MainWorkspaceGlass`、`AppSidebar`、`MusicMiniPlayer` |
| L2 | Panel / Card | 页面头部、设置面板、卡片、列表容器、内容框 | 弱透明，无模糊 | `PageHeader`、`Card`、`EmptyState`、`document-list` |
| L3 | Row / Sub-panel | 列表行、字段组、嵌套子块、次级面 | 更实，无模糊 | 任务行、交互图行、证据块 |
| L4 | Control | 按钮、输入、下拉、开关、滑杆、标签页 | 接近实色 | `Button`、`Input`、`Select`、`Slider` |
| L5 | Overlay | 对话框、下拉菜单、Toast、命令面板 | 实色 | `Dialog`、`Popover`、`Toast` |

规则：

- **同一层级只有一个底色 token**，组件不得再叠 alpha；
- 只有 L1 使用 `backdrop-filter`；L2–L5 只提升底色 alpha，不再叠模糊；
- L2–L5 透明度逐级升高，L5 必须实色；层级越高越实，保留层次感；
- 弹层统一实色，保证可读性，不随整屏背景变化；
- 悬浮/hover/选中态属于状态色，不新增层级。

## 4. Token 契约

新增语义 token（完整颜色值，直接作为 Tailwind 颜色使用）：

```css
--ui-canvas: hsl(var(--background) / 0.66); /* L1 工作区（最透） */
--ui-chrome: hsl(var(--card) / 0.60);       /* L1 侧栏/浮动条 */
--ui-card: hsl(var(--card) / 0.86);         /* L2 面板/卡片/列表容器 */
--ui-row: hsl(var(--card) / 0.92);          /* L3 次级行/子块 */
--ui-control: hsl(var(--background) / 0.96);/* L4 控件 */
--ui-overlay: hsl(var(--popover));          /* L5 弹层（实色） */
```

- 明/暗两套值，命名主题只继承：
  - 亮色（stellar light、moonwhite、sakura）：canvas 0.66 / chrome 0.60 / card 0.86 / row 0.92 / control 0.96；
  - 暗色（stellar dark、nocturne-gold）：canvas 0.72 / chrome 0.66 / card 0.90 / row 0.94 / control 0.97；
- L1 才允许 `backdrop-filter`（24px），L2–L5 不叠模糊；
- 聊天模式（非整屏）下 L1 退化为实色，由 `[data-main-background='chat']` 覆盖；
- `prefers-reduced-transparency: reduce` 时全层级退化为实色并移除模糊；
- Tailwind 配置新增 `ui.canvas/chrome/card/row/control/overlay`，组件只允许使用 `bg-ui-*`。

## 5. 登记表

登记表单独维护：[surface-registry.md](./surface-registry.md)。

字段：

| 字段 | 说明 |
|---|---|
| 模块 | 页面或功能域 |
| 组件/元素 | 需要登记的最小单元 |
| 文件 | 主要实现位置 |
| 当前类（抽样） | 现状 |
| 目标层级 | L0–L5 |
| 目标 token | `bg-ui-*` |
| 状态 | 待登记 / 待迁移 / 已迁移 / 白名单 |
| 备注 | 特殊说明 |

登记粒度：

- 共享组件按“组件 + 变体”登记（如 Button 的 4 个变体、Dialog、EmptyState）；
- 页面按“页面头部、主容器、列表容器、行、控件组”登记，不逐实例登记；
- 弹层内组件单独登记为 L5。

## 6. 门禁与自动化

新增 `scripts/check-surfaces.mjs`，纳入 `pnpm check`：

1. 扫描 `apps/web/src/**/*.tsx` 的 `className`；
2. 禁止在业务代码中出现：
   - `bg-card/<alpha>`、`bg-background/<alpha>`、`bg-surface-*/<alpha>`；
   - 无 token 的 `bg-card` / `bg-background` / `bg-popover`（白名单除外）；
   - `bg-white`、`bg-black/xx` 等硬编码表面（遮罩、舞台沉浸样式白名单）；
3. 存量写入 `scripts/.surfaces-baseline.json`，只允许减少，不允许新增；
4. 输出按模块聚合的违例数，便于分批迁移；
5. 白名单按文件登记并注明原因（如舞台深色悬浮层、壁纸遮罩）。

配套：

- `pnpm check` 增加 `check:surfaces`；
- 新增组件 PR 必须登记到 `surface-registry.md`；
- 迁移完成后再把存量基线清零。

## 7. 迁移顺序

| 阶段 | 内容 | 验收 |
|---|---|---|
| S0 | 方案、层级、token 命名、登记表、扫描脚本 | 本文与登记表评审通过 |
| S1 | 主题 token 与 Tailwind `ui.*`；渐进透明度材质；门禁基线 | ✅ 已完成：六个 token、`check:surfaces`（330 处 / 170 文件基线） |
| S2 | 共享基座：Card、Button、Input、Select、Dialog、EmptyState、Toast、Badge | ✅ 已完成 |
| S3 | 布局与首批模块：Sidebar、PageHeader、Settings、Knowledge、Reports、Assistants | ✅ 已完成：门禁 330 → 232 处（settings 119 → 48） |
| S4 | 其余模块：Chat、Tasks、Plans、Meetings、Audit、Timeline、Flows、Flow Editor、Voice、Music、Journal、Approvals、Document Viewer | 全模块截图通过 |
| S5 | 移除兼容层、清零基线、更新文档与博客 | `check:surfaces` 零违例 |

## 8. 验证矩阵

- 模式：聊天 / 整屏；
- 主题：stellar 亮、stellar 暗、nocturne-gold、moonwhite、sakura；
- 页面：设置、知识库、运行报告、助手、对话、任务、能力包、日常回眸；
- 检查项：
  - 同层级底色一致；
  - L2–L5 逐级更实，L5 完全实色；L2 及以下不叠模糊；
  - 列表/内容框有明确卡面；
  - 文字对比度不低于现有基线；
  - 关闭系统透明效果后全部为实色。

## 9. 风险与回滚

| 风险 | 对策 |
|---|---|
| 一次性替换类名导致视觉回退 | 分批迁移 + 兼容层，按模块提交 |
| 主题 token 嵌套引用失效 | token 只引用既有 HSL 变量，不新增颜色来源 |
| 透明/模糊性能下降 | 仅 L1 使用 `backdrop-filter`，其余实色 |
| 门禁误伤舞台/壁纸等特殊场景 | 文件级白名单 + 原因注释 |
| 登记表与代码漂移 | 新增组件必须登记，门禁扫描类名与登记表交叉校验 |

## 10. 结论

这次不再继续单点调透明度。先登记、再定层级、最后用 token 和门禁锁住；完成后新增页面只需要“选层级”，不再需要讨论“这里该多透”。
