---
title: "PDF intake 的三大坑：webpack externals + 中文逐字换行 + 全链路复盘"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B07"
tags: ["workbuddy", "pdf", "pdfjs", "nextjs", "webpack", "chinese"]
date: "2025-Q4"
---

## PDF 是 v0.3 最复杂的 intake 格式

PDF 不像 txt/md 直接 `fs.readFileSync`，也不像 docx 是有明确 schema 的 OOXML zip。PDF 本质上是一个排版描述语言，里面没有「段落」「标题」这些语义，只有「这个矩形里画了这段文字，用这个字体」。

我们选了 pdfjs-dist（Mozilla 官方的 PDF.js 库），`legacy/build` 版本——不需要原生编译，纯 JS + web worker。但 PDF 的问题恰恰因为它是纯 JS + web worker，和 Next.js server bundling 之间会发生奇妙的化学反应。

这篇按时间顺序讲三个坑：**坑 1 上线前 3 天发现**、**坑 2 上线后 1 周才接到用户反馈**、**坑 3 写代码时就想到了但差点忘**。

---

## 坑 1：Next bundling 把 pdf.worker.mjs 的相对路径搞丢了

### 现象

PDF 文档上传到知识库后，ingestion 过程报错：

```
Error: Setting up fake worker failed: "Cannot read properties of undefined (reading 'Worker')".
```

错误发生在 `readDocumentText` 调用链里的 `readPdf`：

```typescript
// packages/core/src/ingestion/read-document.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function readPdf(data: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  // ...
}
```

本地开发模式（`next dev`）完全正常，生产 standalone 部署（`next build && node .next/standalone/server.js`）100% 复现。

### 根因

pdfjs-dist 的 legacy build 是这样加载 worker 的：

```javascript
// pdfjs-dist/legacy/build/pdf.mjs（伪代码）
import { Worker } from './pdf.worker.mjs';
// 或者用相对路径字符串 require
```

它假设 `pdf.mjs` 和 `pdf.worker.mjs` 在**同一个目录下**。

Next.js 在 production build 时用 webpack 打包服务端代码。它会把 `pdfjs-dist/legacy/build/pdf.mjs` 依赖的所有模块（包括 `pdf.worker.mjs`）一起打包进 `.next/server/vendor-chunks/` 目录下的一个或多个 chunk 文件里。

这时候 `pdf.mjs` 内部那个相对路径 `'./pdf.worker.mjs'` 就找不到了——因为 worker 被拆到了另一个 chunk，chunk 名可能是 `pdf.worker.abc123.js` 之类的 hash 名，不在 `pdf.mjs` 的同级目录。

pdfjs 源码里有一个「fake worker」的 fallback——当它找不到真的 worker 时，会尝试在同一个主线程里模拟 worker。但这个 fake worker 需要从全局或某个路径拿到 Worker class，而 Next 打包后这个路径也被改坏了，所以最终报了上面的错。

### 排查过程

1. 本地 `next dev` 没问题 → 不是代码逻辑错，是构建产物的问题
2. 加了 `console.log` 看 `pdfjs` 的 `GlobalWorkerOptions.workerSrc` → 生产环境里是一个被改写过的 webpack 内部路径，不是真实文件路径
3. 检查 `.next/server/vendor-chunks/` → `pdf.mjs` 和 `pdf.worker.mjs` 都被拆成了独立文件，但相对位置被 webpack 打乱了
4. 查 pdfjs 官方 issue → 确实是 Next.js server bundling 的经典问题，社区解决方案就是 **webpack externals**

### 修法

`apps/web/next.config.mjs`：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...
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

  /**
   * pdfjs-dist 的 legacy build 内部用相对路径加载 pdf.worker.mjs，
   * Next bundling 后路径被改写到 .next/server/vendor-chunks/（不存在），
   * 导致 Route Handler 调用 pdfjs.getDocument() 时抛出 fake worker 失败。
   * 解决：把 pdfjs-dist 整包设为 webpack externals，Node 运行时直接 require 原始文件。
   */
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      config.externals = config.externals || [];
      const existing = Array.isArray(config.externals) ? config.externals : [config.externals];
      config.externals = [
        ...existing,
        /^pdfjs-dist(\/.*)?$/,   // ← 关键：正则匹配整个 pdfjs-dist 包及其所有子路径
      ];
    }
    return config;
  },
};
```

两个配合项：

1. **`serverComponentsExternalPackages: ['pdfjs-dist']`**——这是 Next 官方提供的更优雅的方案，告诉 Next 不要把这个包转译。但它只在 server components / Route Handler 场景生效，某些 edge case 下可能漏。所以我们**同时配了 externals 正则**，双重保险。
2. **`outputFileTracingIncludes`**——standalone 模式下需要把 `node_modules/pdfjs-dist/**/*` 全部纳入 tracing，这样 `node .next/standalone/server.js` 时能正确找到原始的 `pdf.worker.mjs`。

### 为什么不能用完整 build 而不是 legacy build

pdfjs-dist 有三个 build：
- `legacy/build`——纯 JS + worker，兼容所有 Node 版本 ✅（我们用的）
- `build`——ESM + worker
- `minified/build`——压缩版

完整 build 也有 worker 路径问题，而且在某些老 Node 版本下有 CJS/ESM 互操作问题。legacy build 最稳定。

### 为什么不手动指定 workerSrc

pdfjs 允许手动设置 `GlobalWorkerOptions.workerSrc`：

```javascript
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
```

这个方案在 Vite 里好用，但在 Next.js 里还是会碰到 bundling 把相对路径改坏的问题。externals 是更彻底的方案——**让 bundler 完全不碰这个包，Node 运行时的 require/import 自己处理路径**。

---

## 坑 2：中文 PDF 逐字换行

### 现象

英文 PDF 完全正常，但中文 PDF（尤其是从 Word 导出或扫描 OCR 后导出的）解析出来是：

```
这 是 一 段 中 文 文 本， 用 于 测 试 。
```

每个字之间有空格，段落之间也没换行。

### 根因

PDF 里没有「段落」这个概念。它存的是：

```
在坐标 (x=100, y=200) 处，用字体 SimSun，字号 12pt，画出字符「这」
在坐标 (x=106, y=200) 处，用字体 SimSun，字号 12pt，画出字符「是」
在坐标 (x=112, y=200) 处，用字体 SimSun，字号 12pt，画出字符「一」
...
```

pdfjs 调用 `page.getTextContent()` 会返回一堆 `TextItem`，每个 item 包含 `str`（单个字或一个词）和 `transform` 数组（`[a, b, c, d, e, f]` 是仿射变换矩阵，其中 `[3]` 是字号绝对值，`[5]` 是 y 坐标）。

很多中文 PDF（尤其是 OCR 产物）的 TextItem 是**逐字**的——`str: '这'`, `str: '是'`, `str: '一'`。英文 PDF 通常是按词的——`str: 'Hello'`, `str: 'world'`。

### 第一版错误修法：直接拼接

```typescript
// ❌ 第一版
for (const item of items) {
  lines.push(item.str);
}
return lines.join('');
```

逐字直接拼出来是「这是一段中文文本，用于测试。」——看上去对了。但问题是 PDF 里**不同行的字可能 y 坐标有细微抖动**（sub-pixel rendering），或者遇到中英混合（字号变了），或者段落间 y 坐标跳了 24pt 但被忽略了。最终所有字都拼成了一个大长行，段落结构完全丢失。

### 第二版：mergePdfTextItems

```typescript
// packages/core/src/ingestion/read-document.ts
export function mergePdfTextItems(items: readonly unknown[]): string {
  const lines: string[] = [];
  let current: string[] = [];
  let prevY: number | null = null;
  let prevFontSize: number | null = null;
  const Y_TOLERANCE = 1.5;   // PDF pt 单位，1.5 足够吸收 sub-pixel 抖动

  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[] };
    if (!item.str) continue;

    // pdfjs 在一些中文 PDF 里插入 \u0001 控制符
    const str = item.str.split('\x01').join('').trim();
    if (!str) continue;

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
    const y = transform[5] ?? 0;                              // y 坐标
    const fontSize = Math.abs(transform[3] ?? 1);             // 字号（绝对值）

    const rowChanged = prevY !== null && Math.abs(y - prevY) > Y_TOLERANCE;
    const fontChanged = prevFontSize !== null
      && Math.abs(fontSize - prevFontSize) > 0.5
      && current.length > 0;

    if (rowChanged || fontChanged) {
      lines.push(current.join('').trim());
      current = [];
    }
    current.push(str);
    prevY = y;
    prevFontSize = fontSize;
  }
  if (current.length > 0) lines.push(current.join('').trim());

  return lines.filter((l) => l.length > 0).join('\n');
}
```

三个判定条件：

| 条件 | 含义 | 值 |
|------|------|----|
| `rowChanged` | y 坐标差 > 1.5pt | 行变了，push 当前行、开新行 |
| `fontChanged` | 字号差 > 0.5pt | 可能是标题 → 正文的切换，换段 |
| `\x01` 过滤 | 中文 PDF 控制符 | 一些中文 PDF 在 TextItem 里插了 `\u0001` 分隔符，必须过滤 |

### 为什么字号变化也算换行

想象一个 PDF：标题 18pt、正文 12pt。标题那一行的字号会比正文大 6pt，远超 0.5 的阈值。所以 merge 会把标题和正文分到不同行——完美，正好符合预期。

### 测试样本

我们用三个真实 PDF 做回归测试：
1. 英文技术文档（按词切的 TextItem）
2. 中文 Word 导出 PDF（按字切的 TextItem）
3. 扫描件 OCR 导出 PDF（逐字 + 可能 y 抖动）

每个样本在 ingest 后走 RAG 检索，验证关键段落能否被正确召回。

---

## 坑 3：isEvalSupported 关掉 eval

这个坑不大，但**写代码时就想到了**，所以提前处理了。

```typescript
const doc = await pdfjs.getDocument({
  data,
  isEvalSupported: false,   // ← 关掉
}).promise;
```

pdfjs 默认开 `eval` 来做一些高性能操作。Next.js production 模式可能有 CSP 限制，或者 standalone 模式下的安全扫描工具会报警告。显式关掉，纯 JS 路径，慢点但稳。

---

## 完整 intake 流水线

把 PDF 放进整个文档处理流水线看：

```
用户上传 PDF（multipart/form-data）
  │
  ▼
apps/web/src/app/api/knowledge-bases/[id]/documents/route.ts
  │
  ▼
document-route.ts 调用 IngestionPipeline.ingest()
  │
  ▼
packages/core/src/ingestion/ingestion-pipeline.ts
  │
  ├── readDocumentText(filename, data)
  │     └── detectKind('.pdf') → readPdf(data)
  │           └── pdfjs.getDocument()   ← externals 修复的地方
  │           └── page.getTextContent()
  │           └── mergePdfTextItems()   ← 中文逐字换行修复
  │
  ├── chunking（按段落切 chunk）
  ├── embedding（调 provider 的 embed 端点）
  └── 写入 SQLite + sqlite-vec
```

三个坑正好分布在流水线的三个不同层：
- 坑 1（externals）在**包加载层**
- 坑 2（merge）在**文本提取层**
- 坑 3（eval）在**pdfjs 配置层**

---

## 小结

PDF intake 三大坑给我们的教训：

1. **外部库 + webpack bundling = 定时炸弹**。只要一个库依赖相对路径加载子资源（worker、wasm 文件），在 Next production build 下就有可能炸。externals 是最稳妥的解法。
2. **PDF 没有语义**。所有 PDF 文本提取后都需要自己做合并逻辑——按 y 坐标 + 字号合并同行，过滤控制符，容忍 sub-pixel 抖动。
3. **写代码时就能预判的坑，别等上线再修**。`isEvalSupported: false` 是看了 pdfjs issue 列表后直接加上的，避免了后续排查 CSP 问题。

整个 PDF intake 最终代码其实很简洁——`read-document.ts` 里 `readPdf` 函数不到 15 行，`mergePdfTextItems` 不到 40 行。坑都出在**包管理和 PDF 格式本身**，不在业务逻辑。

下一篇 B08 讲 Office 三格式（docx/xlsx/pptx）的解析选型——为什么 mammoth 不直接输出文本、为什么 SheetJS 要锁版本、为什么 pptx 自己手写。
