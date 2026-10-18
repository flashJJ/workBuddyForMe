# 设计令牌与控件使用规范

> 目的：把「颜色 / 圆角 / 间距 / 控件」的既有约定写成可查的单一真源，避免再次出现「同一个下拉两种实现」「标签紧贴控件」「数值框数字被裁」这类不一致。
> 适用范围：`apps/web`（Next.js 前端）。真源文件：[globals.css](../../apps/web/src/app/globals.css)（CSS 变量）+ [tailwind.config.ts](../../apps/web/tailwind.config.ts)（变量到工具类的映射）。

## 1. 颜色令牌

所有颜色以 **HSL 变量** 定义在 `globals.css` 的 `:root` / `.dark`，Tailwind 侧只做「变量 → 语义类」映射。**禁止在组件里写死十六进制或 `emerald/red/amber` 之类原始色**（历史遗留已收敛）。

| 语义类 | CSS 变量 | 用途 |
|---|---|---|
| `bg-background` / `text-foreground` | `--background` / `--foreground` | 页面底色与正文 |
| `bg-card` / `text-card-foreground` | `--card` | 卡片、面板 |
| `bg-popover` / `text-popover-foreground` | `--popover` | 浮层（下拉面板、菜单） |
| `bg-primary` / `text-primary-foreground` | `--primary` | 主行动色（按钮、选中态） |
| `bg-secondary` / `bg-muted` / `bg-accent` | `--secondary` / `--muted` / `--accent` | 次级底色、静默底色、悬停高亮 |
| `bg-destructive` | `--destructive` | 危险操作 |
| `border-border` / `border-input` / `ring-ring` | `--border` / `--input` / `--ring` | 描边、输入框描边、焦点环 |
| `text-muted-foreground` | `--muted-foreground` | 次要文字（对比度已按 4.5:1 校过） |
| `text-success` / `bg-success-background` 等 | `--success` / `--success-bg` | 状态语义（success / warning / info 三组同理） |

**命名主题**：`:root[data-theme='nocturne-gold' | 'moonwhite' | 'sakura']` 覆写同一组变量；未覆写的令牌按明暗自动继承。改主题只需加一段变量，**不要新增硬编码色**。

**深色模式**：`.dark` 覆写同名变量；组件一律用语义类，禁止 `dark:` 手写变体（历史写法，已收敛）。

## 2. 圆角 / 间距 / 字号

- **圆角**：`rounded-lg` = `var(--radius)`（0.625rem）；`rounded-md` = `radius − 2px`；`rounded-sm` = `radius − 4px`。控件默认 `rounded-md`，卡片/浮层默认 `rounded-lg`。
- **控件高度**：表单控件统一 `h-9`；紧凑场景（表格行内、设置列表）可用 `h-8`，同一行内保持等高。
- **字段间距**：标签与控件之间固定 `gap-1.5`（由 `FormField` 固化）；字段与字段之间 `space-y-4`（对话框）或 `gap-3`（行内网格）。
- **字号**：正文 `text-sm`；次要说明 `text-xs`；更小的辅助行 `text-[11px]` 仅在既有场景沿用，新代码优先 `text-xs`。
- **间距刻度**：只用 Tailwind 默认刻度（1/1.5/2/3/4/5/6），不写任意值（`gap-[7px]` 这类）除非确有设计依据。

## 3. 控件使用规范（重要）

**一律使用 `apps/web/src/components/ui/` 下的统一组件，禁止裸用原生控件。** 这是 v2.3 收敛的成果，请勿回退：

| 场景 | 必须使用 | 禁止 |
|---|---|---|
| 下拉选择 | `SimpleSelect`（原生语义：`value` + `<option>/<optgroup>` 子节点）或组合式 `Select`（需要 Trigger/Content/Item 精细控制时） | 裸 `<select>` |
| 数值输入 | `NumberInput`（`[−][数字][+]` 步进器，自带上下限钳制） | 裸 `<input type="number">`（浏览器原生 spinner 生硬且不可控） |
| 表单字段容器 | `FormField`（label + 控件 + hint/error 的统一间距） | 手写 `<div class="space-y-1"><label>…` |
| 文本输入 | `Input` / `Textarea` | 裸 `<input>` / `<textarea>`（除 `type="checkbox"` / `type="color"` / `type="range"` 等原生专有控件） |
| 徽标 / 按钮 | `Badge` / `Button` | 自绘 span/button 配色 |

### 三条硬约束

1. **不要给统一控件传「原生样式类」**。`NumberInput` / `SimpleSelect` 自带边框与内边距，再传 `border bg-background px-2 py-1.5` 会重复描边并**挤掉内部空间**。
2. **不要给统一控件传受限宽度**。`NumberInput` 的尺寸自持（容器 `w-fit`、按钮 `w-7`、输入框 `w-14`），传 `w-20` 这类小宽度会把数字裁成看不见（历史 Bug：表现为「点加减没反应」）。需要更宽时用 `w-full` 让输入框自适应，或干脆不传。
3. **Radix 下拉的 `value` 不能是空字符串**。需要「未选择 / 不限」语义时用 `SimpleSelect`（内部用哨兵值承载），不要自己给 `Select` 传 `''`。

## 4. 响应式约定

- 断点复用 Tailwind 默认：`sm 640` / `md 768` / `lg 1024`。
- **侧栏在 `< md`（768px）自动折叠为图标态**（`w-14 md:w-56`，文案 `hidden md:inline`，`title` 提供可访问名）。
- 表单栅格用 `minmax(0,1fr)` 而非 `1fr`，避免长文本撑破列宽；固定像素列只在 `lg` 及以上出现。
- 三档视口的自动验收见 [responsive-v23.spec.ts](../../tests/e2e/responsive-v23.spec.ts)（1280/900/720，断言无横向滚动 + 侧栏折叠）。

## 5. 可访问性底线

- 交互控件必须有可访问名（`aria-label` 或 `<label htmlFor>`）；纯图标项用 `title` 兜底。
- 焦点环由基元自带（`focus-visible:ring-2 ring-ring`），不要再叠 `outline`。
- 语义状态用 `Badge` 的语义变体，不要靠颜色单独表意。
