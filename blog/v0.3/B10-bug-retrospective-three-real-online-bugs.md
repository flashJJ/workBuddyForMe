---
title: "v0.3 三个真实线上 Bug 复盘：pdfjs externals、Dialog z-index、PDF span 合并"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B10"
tags: ["workbuddy", "bug", "nextjs", "webpack", "pdfjs", "radix-ui", "tailwindcss"]
date: "2025-Q4"
---

## 为什么要写 Bug 复盘

B01~B09 讲了 v0.3 的设计和实现，这篇专门讲**三个真实出现在生产环境里的 Bug**。为什么单独拎出来？因为这三个 Bug 有一个共同点：**都不是业务逻辑错，都是框架/工具链层面的坑**。

- 坑 1（pdfjs externals）——Next.js server bundling 对带 worker 的库处理不当
- 坑 2（Dialog z-index）——Radix UI + Tailwind 的层级设计有个默认坑
- 坑 3（PDF span 合并）——pdfjs 对中文 PDF 的 TextItem 切分方式不符合直觉

三个 Bug 的共性：**在本地 dev 模式下完全正常，生产环境才暴露**。这是开发体验 vs 生产环境最大的鸿沟。

---

## Bug 1：pdfjs-dist fake worker（生产环境 100% 复现）

### 现象

v0.3 Beta 上线前一天，CI 里加了一个 `next build && node .next/standalone/server.js` 的 smoke 测试。PDF 文档上传到知识库后调用 `readDocumentText → readPdf`，报错：

```
Error: Setting up fake worker failed: "Cannot read properties of undefined (reading 'Worker')".
```

本地 `next dev`（非 standalone）完全正常。`next build` 之前用 `next start`（也是非 standalone）也正常。只有 `next build && node standalone` 模式下必现。

### 排查时间线

| 时间 | 操作 | 结果 |
|------|------|------|
| T+0 | 本地 dev 复现 | ❌ 正常 |
| T+5 | 本地 next start 复现 | ❌ 正常 |
| T+10 | 本地 node standalone 复现 | ✅ 复现 |
| T+20 | 检查 pdfjs `GlobalWorkerOptions.workerSrc` | 生产环境是 webpack 改写后的内部路径，不是真实文件 |
| T+30 | 手工指定 workerSrc `new URL(...)` | ❌ Next bundling 还是会改相对路径 |
| T+45 | 检查 `.next/server/vendor-chunks/` | pdf.mjs 和 pdf.worker.mjs 被拆到不同 chunk，相对位置错乱 |
| T+60 | 查 Next.js GitHub issues | 发现官方推荐的解决方案是 `serverComponentsExternalPackages` + webpack externals |
| T+75 | 改 next.config.mjs + 验证 build | ✅ 修复 |

### 根因

pdfjs-dist 的 legacy build 内部是这样加载 worker 的：

```javascript
// pdfjs-dist/legacy/build/pdf.mjs 里（伪代码）
import('./pdf.worker.mjs').then(mod => { ... });
// 或者
new Worker(new URL('./pdf.worker.mjs', import.meta.url));
```

**关键**：worker 文件的路径是**相对于 pdf.mjs 自身的位置**。

Next.js 在 production build 时用 webpack 做 server-side bundling。它会把所有 `node_modules` 的依赖都打包进 `.next/server/` 下的 chunk 文件里，其中：
- `pdfjs-dist/legacy/build/pdf.mjs` 被识别为入口依赖
- `pdfjs-dist/legacy/build/pdf.worker.mjs` 也被一起打包到某个 chunk 里

但 webpack 的 chunk 拆分策略会把 worker 丢到 `vendor-chunks/pdf.worker.abc123.js`（hash 化文件名），而 `pdf.mjs` 在 `vendor-chunks/pdf.abc456.js`。**它们不再是同一个目录下的相对位置了**。

pdfjs 尝试 `import('./pdf.worker.mjs')`，webpack 把它转成了一个 webpack 内部的 chunk 加载调用，但这个调用指向的是一个 hash 化的文件名，和 pdfjs 源码里写死的相对路径不匹配。pdfjs 找不到 worker，fallback 到 fake worker（在主线程模拟 worker），但 fake worker 也需要正确的 Worker 类——在 webpack 改写后的环境里找不到，最终抛出那个诡异的错误。

### 修复

`apps/web/next.config.mjs`：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sqlite-vec', 'pdfjs-dist'],
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/sqlite-vec/**/*',
        './node_modules/.pnpm/sqlite-vec@*/node_modules/sqlite-vec/**/*',
        './node_modules/pdfjs-dist/**/*',
        './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/*',
      ],
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(Array.isArray(config.externals)
        ? config.externals : [config.externals]),
        /^pdfjs-dist(\/.*)?$/,
      ];
    }
    return config;
  },
};
```

**三层防护**：

1. `serverComponentsExternalPackages`——Next 官方 API，告诉 Next 不要把这个包转译，保留原始 require/import
2. `webpack externals`——正则 `/^pdfjs-dist(\/.*)?$/` 匹配整个包及其所有子路径，让 webpack 完全不碰它，Node 运行时直接 `require('pdfjs-dist/legacy/build/pdf.mjs')` → Node 自动解析到 `node_modules/pdfjs-dist/legacy/build/pdf.mjs` → worker 在同一目录 → ✅
3. `outputFileTracingIncludes`——standalone 模式下把 pdfjs-dist 的所有文件追踪进输出目录

### 教训

- **带内部资源（worker、wasm、data 文件）的包，极大概率和 bundler 冲突**。任何时候引入一个有 worker 的库，第一反应应该是「这个库能不能被 bundler 正确处理？」
- **CI 里必须有 production build 的 smoke 测试**。我们加这个测试后 24 小时内就抓了这个 Bug，没让它流到用户手里。
- **`next build && node standalone` 比 `next start` 更接近用户真实部署场景**，不要只测后者。

---

## Bug 2：Dialog 嵌套时 z-index 同级重叠（上线后一周用户反馈）

### 现象

上线后一周有用户发反馈：「从设置 → 模型管理 → 添加模型，对话框叠在父对话框下面了，输不了表单」。

具体操作路径：
1. 打开设置页面
2. 点击「添加助手」→ 弹出一个 Dialog（Assistant Form）
3. 在这个 Dialog 里点击「切换模型」→ 弹出**第二个** Dialog（Model Form）
4. 第二个 Dialog 的**内容区域**被**第一个 Dialog 的遮罩层**挡住了

### 根因

`apps/web/src/components/ui/dialog.tsx` 里：

```tsx
// ❌ 原始代码
<DialogOverlay className="fixed inset-0 z-50 bg-black/60 ..." />
<DialogContent className="fixed ... z-50 ..." />
```

Radix Dialog 的层级模型是：

```
<Dialog>        ← Root
  <DialogPortal>  ← 渲染到 body
    <DialogOverlay />   ← z-50
    <DialogContent />   ← z-50
  </DialogPortal>
</Dialog>
```

两个元素都是 `z-50`，所以**在同一个 Dialog 实例里，Overlay 和 Content 是同级的**。正常情况下 DOM 顺序 Content 在 Overlay 之后（Portal 里先渲染 Overlay 再 Content），所以 Content 应该在上面——CSS 的层叠规则里，同级后渲染的盖住先渲染的。

但嵌套 Dialog 的情况是：

```
<body>
  <!-- 第一个 Dialog Portal -->
  <div data-radix-popper>
    <DialogOverlay>  <!-- z-50 -->
    <DialogContent>  <!-- z-50 -->
      <!-- 点击按钮触发第二个 Dialog -->
      
  <!-- 第二个 Dialog Portal（append 到 body 末尾） -->
  <div data-radix-popper>
    <DialogOverlay>  <!-- z-50 → 和上面的 Content 同级 -->
    <DialogContent>  <!-- z-50 → 应该在最上面，但... -->
```

**问题在于**：Radix Dialog 的 Portal 在 body 上创建了独立的 DOM 节点，但两个 Portal 之间没有显式的 z-index 层级关系。第一个 Dialog 的 DialogContent（z-50）和第二个 Dialog 的 DialogOverlay（z-50）是**兄弟节点**，它们的层叠顺序由 DOM 顺序决定——第一个 Dialog 的 Content 先渲染，所以第二个 Dialog 的 Overlay 和第二个 Dialog 的 Content 都应该在它上面。

但**实际表现是**第二个 Dialog 的 Content 被第一个 Dialog 的 Overlay 挡住了。为什么？因为 Radix Dialog 内部有一个 `z-index` 的处理逻辑——它可能给第一个 Dialog 创建了一个更高的 stacking context，导致第二个 Dialog 的元素即使 DOM 顺序在后面，也被限制在父级的 stacking context 里。

### 修复

把 `DialogContent` 提到 `z-[51]`，保持 `DialogOverlay` 在 `z-50`：

```tsx
// ✅ 修复后
<DialogOverlay className="fixed inset-0 z-50 bg-black/60 ..." />
<DialogContent className="fixed ... z-[51] ..." />
```

这样：
- **同一个 Dialog 内**：Content（z-51）肯定盖过 Overlay（z-50）
- **嵌套 Dialog**：第二个 Dialog 的 Overlay（z-50）盖过第一个 Dialog 的 Overlay（z-50，DOM 顺序在后），但第二个 Dialog 的 Content（z-51）又盖过自己的 Overlay（z-50）和第一个 Dialog 的 Content（z-50）

层级清晰：`第一个 Overlay`(50) → `第一个 Content`(50) → `第二个 Overlay`(50) → `第二个 Content`(51)。不对……这样第一个 Content(z-50) 和第二个 Overlay(z-50) 还是同级啊。

等一下，我重新理：

```
DOM 顺序（body 下）：
  1. Dialog1.Overlay   z-50
  2. Dialog1.Content   z-50
  3. Dialog2.Overlay   z-50
  4. Dialog2.Content   z-51
```

z-index 同级时后渲染的在上面。所以层级关系（底到顶）：
- Dialog1.Overlay (最底)
- Dialog1.Content (在 Overlay 上，因为 DOM 后)
- Dialog2.Overlay (在 Dialog1.Content 上，因为 DOM 后)
- Dialog2.Content (最顶，z-51 比所有 50 都高)

这样 Dialog2.Content 肯定在所有东西上面。**这就是我们想要的**。

修复只有一行 Tailwind class 的改动——把 `z-50` 改成 `z-[51]`。

### 教训

- **Radix Dialog（或任何 Portal 组件）的 Overlay 和 Content 不应该同级**。Overlay 应该低一档，Content 应该高一档。这样嵌套时不会出现层级问题。
- **Tailwind 的 `z-[51]` 是合法的任意值语法**，别担心不是 Tailwind 默认值——Tailwind 3+ 支持任意整数。
- **嵌套 UI 组件一定要测**。我们写组件时默认了「只用到一层」，但实际用户操作路径经常会嵌套。如果有 E2E 测试覆盖「打开 Dialog 里再打开 Dialog」这个场景，这个 Bug 就能在上线前抓了。

---

## Bug 3：中文 PDF 逐字换行（写代码时预判了，上线后才验证）

### 现象

英文 PDF 解析完美，但中文 PDF（尤其是从 Word 导出的）解析出来是：

```
这 是 一 段 中 文 文 本， 用 于 测 试 v0.3 入 口。
```

每个字之间有空格，段落间也没换行。

### 根因

PDF 本质是排版描述，没有「段落」「词」这些语义。pdfjs 的 `page.getTextContent()` 返回的是 TextItem 数组，每个 TextItem 包含：
- `str`——这一段的文本（可能是一个字、一个词、或一句话）
- `transform`——仿射变换矩阵，`transform[5]` 是 y 坐标，`transform[3]` 是字号绝对值

英文 PDF 通常是**按词切的 TextItem**：`[Hello, world, foo, bar]`。但中文 PDF（尤其是 Word 导出或 OCR 后的）经常是**按字切的**：`[这, 是, 一, 段, 中, 文, 文, 本]`。

如果直接把所有 `item.str` 用空格拼起来，英文会变成 `Hello world foo bar`（还能看），中文变成 `这 是 一 段 中 文 文 本`（能看但多了空格，段落边界丢失）。

第一版的 `readPdf` 实现：

```typescript
// ❌ 第一版
const text = items.map(item => item.str).join(' ');  // 用空格拼
```

### 修复：mergePdfTextItems

```typescript
export function mergePdfTextItems(items: readonly unknown[]): string {
  const lines: string[] = [];
  let current: string[] = [];
  let prevY: number | null = null;
  let prevFontSize: number | null = null;
  const Y_TOLERANCE = 1.5;   // PDF pt 单位，1.5 足够

  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[] };
    if (!item.str) continue;

    // 过滤 pdfjs 在中文 PDF 里插入的 \u0001 控制符
    const str = item.str.split('\x01').join('').trim();
    if (!str) continue;

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
    const y = transform[5] ?? 0;
    const fontSize = Math.abs(transform[3] ?? 1);

    const rowChanged = prevY !== null && Math.abs(y - prevY) > Y_TOLERANCE;
    const fontChanged = prevFontSize !== null
      && Math.abs(fontSize - prevFontSize) > 0.5
      && current.length > 0;

    if (rowChanged || fontChanged) {
      lines.push(current.join('').trim());   // 同行直接拼接，不加空格
      current = [];
    }
    current.push(str);
    prevY = y;
    prevFontSize = fontSize;
  }
  if (current.length > 0) lines.push(current.join('').trim());

  return lines.filter(l => l.length > 0).join('\n');
}
```

三个关键设计：

1. **同行（y 差 ≤ 1.5pt）直接拼接**——逐字变成一行，中间不加空格
2. **字号变化也算换行**——PDF 里标题 18pt、正文 12pt，字号差 6pt 远超 0.5 阈值，自然分段
3. **过滤 `\x01` 控制符**——一些中文 PDF 的 TextItem 里被插入了这个不可见字符（可能是 PDF 生成器的 bug）

### 为什么 Y_TOLERANCE 是 1.5pt

PDF 坐标系里 1 pt = 1/72 inch。Word 导出的 PDF 里，同一行的字符可能因为 sub-pixel rendering 在 y 方向有 ±0.3pt 的抖动。设 1.5pt 足够吸收抖动，又不会把真正的两行合并。我们用了 3 份真实中文 PDF 样本做回归测试，验证 1.5 这个阈值刚刚好。

### 为什么字号变化也算换行

考虑这种 PDF：

```
第 1 行：标题 18pt y=100  "WorkBuddy For Me v0.3 Release Notes"
第 2 行：标题 18pt y=100  "(续)"                   ← 标题换行了，应该继续同行
第 3 行：正文 12pt y=124  "我们很高兴..."           ← 标题 → 正文，字号变了，应该换行
```

如果只按 y 坐标判断，第 1 行和第 2 行 y 都是 100，字号都是 18 → 同行 ✅。第 3 行 y=124（差 24pt > 1.5pt）+ 字号从 18→12（差 6 > 0.5）→ 换行 ✅。

### 教训

- **PDF 没有语义，所有语义都是我们从排版信息里推断的**。TextItem 的 y 坐标和字号是唯一可靠的信号。
- **写代码时就应该预判到 PDF 格式的坑**——我们在写第一版的时候就看到了中文 PDF 的 TextItem 切分问题，所以 mergePdfTextItems 是提前写好的，不是上线后才补。但如果没有真实样本测试，Y_TOLERANCE 和字号变化阈值可能设错。
- **CI 里应该有多种 PDF 样本的回归测试**。我们后来加了，确保以后改 pdfjs 版本或 merge 逻辑不会再破坏中文提取。

---

## 三个 Bug 的对比

| | Bug 1：pdfjs externals | Bug 2：Dialog z-index | Bug 3：PDF span 合并 |
|--|----------------------|----------------------|---------------------|
| 发现阶段 | 上线前 smoke 测试 | 上线后用户反馈 | 写代码时预判 |
| 环境差异 | dev 正常，prod standalone 坏 | 只在嵌套 Dialog 时触发 | 只在中文 PDF 时触发 |
| 修复成本 | ~50 行 next.config.mjs | 1 行 Tailwind class | ~40 行 merge 函数 |
| 根因类型 | bundler 路径处理 | CSS stacking context | PDF 格式本身 |
| 后续预防 | CI 里加 production build smoke | E2E 测嵌套 UI | 多语言 PDF 回归样本 |

三个 Bug 都不是「代码写错了」这种低级错误——都是**框架 / 库 / 格式本身的边界条件**。这也是为什么我们要写 v0.3 系列博客：很多坑不是你能在写代码时凭直觉预判的，而是要靠真机、靠生产环境 smoke、靠用户反馈来抓。

---

## 给后来者的建议

1. **本地 dev 永远是简化版的生产环境**。任何跟 bundler、standalone、production build 相关的功能，必须在 CI 里有一条独立的 production smoke。
2. **UI 组件的层级设计要保守**。Overlay 和 Content 不要同级，嵌套场景永远存在。
3. **PDF 永远不会按你的预期输出文本**。所有 TextItem 合并逻辑都要有真实样本回归测试——英文、中文、扫描件、Word 导出、PPT 导出，各来一份。
4. **库有内部资源（worker、wasm）时，先查 bundler 兼容性**。pdfjs-dist 如此，monaco-editor、sql.js、sharp 等也是如此。webpack externals 是终极解决方案。

三个 Bug 都修了，v0.3 稳定跑了下来。但每次复盘，我都会在 next.config.mjs 的注释里、dialog.tsx 的 z-[51] 上、read-document.ts 的 Y_TOLERANCE 旁边留下详细的注释——希望以后再遇到类似坑的人，能在 10 分钟内找到答案，而不是像我们这样花一整个下午排查。

这系列 10 篇到此结束。从 B01 的总览到 B10 的 Bug 复盘，v0.3 的技术栈、设计决策、踩坑记录都在这里了。希望对做同类产品的朋友有帮助。
