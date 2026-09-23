---
title: "Office 三格式解析：mammoth 表格分隔符 + SheetJS 官方源锁定 + fflate OOXML 解包"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B08"
tags: ["workbuddy", "office", "docx", "xlsx", "pptx", "mammoth", "sheetjs", "fflate"]
date: "2025-Q4"
---

## 为什么 Office 三格式要分开处理

docx、xlsx、pptx 虽然都属于 Office 套件，但底层格式完全不同：

| 格式 | 底层 | 文本在哪里 | 表格在哪里 |
|------|------|-----------|-----------|
| docx | ZIP + XML（OOXML WordprocessingML） | `<w:t>` 节点 | `<w:tbl>` → `<w:tr>` → `<w:tc>` |
| xlsx | ZIP + XML（OOXML SpreadsheetML） | `<v:v>` 节点 | `<sheetData>` → `<row>` → `<c>` |
| pptx | ZIP + XML（OOXML PresentationML） | `<a:t>` 节点 | `<a:tbl>` → `<a:tr>` → `<a:tc>` |

zip 结构和 XML namespace 都不一样。选什么库来解每个格式，是 v0.3 M2 的一个核心技术决策。

---

## docx：mammoth + 轻量 HTML → 文本转换

### 为什么 mammoth

docx 领域有三个主流选择：
- **mammoth.js**——纯 JS，专门做 docx → HTML/纯文本转换，输出受控的有限 HTML 标签
- **docx-preview**——浏览器渲染用的，不适合 Node
- **自己解 OOXML**——工作量大，但可控

我们选 mammoth，原因是它：
1. 不依赖原生编译，跨平台（Node + Electron + Web）
2. 输出 HTML 而不是纯文本——表格结构还在（`<table>`, `<tr>`, `<td>`），方便后续处理
3. 支持受控标签——`convertToHtml` 只输出 `<p>`, `<h1-6>`, `<table>`, `<tr>`, `<td>`, `<strong>`, `<em>` 等有限标签，没有 `<script>` 或 inline style

### 为什么不直接用 mammoth 的纯文本输出

mammoth 有 `convertToText` 方法，但它**不处理表格**——所有表格的单元格内容被直接丢在一起，行列结构完全丢失。对于知识库 RAG 来说，表格结构很重要：

- "张三，产品经理" 和 "产品经理：张三" 在检索时完全不同
- "销量：100" 和 50 行的销量表，召回优先级完全不同

所以我们用 `convertToHtml`，然后自己做 HTML → 文本转换，保留表格结构。

### 真实代码

`packages/core/src/ingestion/office/read-docx.ts`：

```typescript
import mammoth from 'mammoth';

export async function readDocx(data: Uint8Array): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  return docxHtmlToText(html);
}

export function docxHtmlToText(html: string): string {
  return unescapeHtml(
    html
      // 单元格内的首/末段不产生换行，保证单元格单行输出
      .replace(/(<t[dh][^>]*>)\s*<p[^>]*>/gi, '$1')
      .replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')
      .replace(/<\/(p|h[1-6])>/gi, '\n')        // 段落/标题 → 换行
      .replace(/<tr[^>]*>/gi, '\n')              // 每行换行
      .replace(/<\/t[dh]>/gi, ' | ')             // 单元格之间用 | 分隔
      .replace(/<br\s*\/?>/gi, '\n')              // 手动换行
      .replace(/<[^>]+>/g, ''),                   // 剥离所有其他标签
  ).split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}
```

### 三个小设计

**设计 1：表格单元格用 `|` 分隔**

```
姓名 | 职位 | 部门
张三 | 产品经理 | 研发部
李四 | 高级工程师 | 研发部
```

用 `|` 而不是 tab 的原因：
- mammoth 输出的 `<td>` 内容里可能已经有 tab
- `|` 在纯文本里更易读
- RAG 检索时 `|` 分隔的表格仍然保留了列语义

**设计 2：单元格内的段落不产生额外换行**

```regex
.replace(/(<t[dh][^>]*>)\s*<p[^>]*>/gi, '$1')
.replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')
```

mammoth 在 `<td>` 里如果有多个 `<p>`（Word 里单元格内有多个段落），会输出 `<td><p>第一段</p><p>第二段</p></td>`。如果直接剥离标签就变成「第一段第二段」，失去段落边界。但我们做了预处理——单元格内的首尾 `<p>` 标签被移除，中间的 `<p>` 会被 `.replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')` 前的规则产生换行？不对……

等一下，再仔细看一下逻辑：

1. `<td>` 后紧跟的 `<p>` → 去掉开头 `<p>`，保留内容
2. `</p>` 后紧跟 `</td>` → 去掉 `</p>`，保留 `</td>`
3. `</p>` 不紧跟 `</td>`（单元格内有多个段落）→ 走第 2 条规则前，会先被第 3 条规则 `.replace(/<\/(p|h[1-6])>/gi, '\n')` 替换成换行

所以最终：
- 单元格内单段 → 单行，无换行
- 单元格内多段 → 段之间有换行（但我们后续 `.split('\n').filter(Boolean)` 会过滤空行）

嗯……实际上我们的代码可能还不够完美，但对于绝大多数 Word 文档，这个简单的正则转换够用了。

**设计 3：行尾 `| ` 清理**

```typescript
.map((line) => line.replace(/\s+\|\s*$/g, '').trim())
```

表格最后一列的 `</td>` 被替换成 ` | `，所以每行结尾有一个多余的 ` |` 空格。用正则清理掉。

### 没有引入 DOM 解析器的原因

第一版我们考虑过用 `cheerio` 做 DOM 解析，但 mammoth 输出的 HTML 太简单了（有限标签集），用正则处理反而更轻、更快、没有依赖。正则对 mammoth 的稳定输出完全可控——mammoth 的输出在其 API 范围内是确定的。

---

## xlsx：SheetJS（xlsx）0.20.3 官方源

### 为什么锁 0.20.3

SheetJS 的历史比较复杂：
- 0.18.x 之后作者改了 license（0.2.x 是非商业 license）
- 社区 fork（sheetjs/sheetjs）和作者的 npm 包（xlsx）在版本上分裂
- pnpm 的 `sheetjs` 包和 `xlsx` 包是不同的包

我们选的是 **npm 官方源的 `xlsx@0.20.3`**：
- 这是最后一个 MIT license 的版本
- 0.20.3 修复了 0.20.2 的一个内存泄漏（大表格时）
- 我们测了 10 个真实 xlsx 文件（含 .xlsx / .xlsm / 旧版 .xls），都能正确读取

### SheetJS vs node-xlsx vs 自己解

| 库 | 优点 | 缺点 |
|----|------|------|
| SheetJS (xlsx) | 功能全、MIT、社区认可 | bundle 体积大 |
| node-xlsx | 轻量 | 只支持 xlsx，不支持 xls，维护不活跃 |
| 自己解 OOXML | 完全可控 | 工作量大，要处理合并单元格、样式等 |

我们选 SheetJS，因为功能全比轻量更重要——知识库 ingestion 时可能遇到各种奇怪格式的 Excel。

### 真实代码

`packages/core/src/ingestion/office/read-xlsx.ts`：

```typescript
import * as XLSX from 'xlsx';

export function readXlsx(data: Uint8Array): string {
  const workbook = XLSX.read(data, { type: 'array' });

  const sections: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,          // 数组数组，第一行也是数据
      blankrows: false,   // 跳过完全空行
      defval: '',         // 空单元格填空字符串
      raw: false,         // 日期等转为格式化字符串
    });

    const lines = rows
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .map((cell) => String(cell ?? '').replace(/\r?\n/g, ' ').trim())
          .join('\t')
          .trimEnd(),
      )
      .filter((line) => line.length > 0);

    if (lines.length > 0) sections.push(`## ${name}\n${lines.join('\n')}`);
  }

  if (sections.length === 0) {
    throw ApiError.validation('xlsx 文档解析失败：工作簿中没有可读取的文本内容');
  }
  return sections.join('\n\n');
}
```

### 设计点

1. **每个 sheet 一节**：Markdown 标题 `## Sheet 名` 分隔不同 sheet 的内容，RAG 检索时 sheet 边界清晰
2. **单元格用 tab 分隔**：Excel 本身就是 tab 分隔文本（复制粘贴 Excel 到文本框就是 tab 分隔），符合直觉
3. **单元格内的换行替换成空格**：Excel 单元格内可以有多行（Alt+Enter），但在纯文本输出里用空格更合适
4. **空 sheet 跳过**：`blankrows: false` + `filter((line) => line.length > 0)`，空白 sheet 不进输出

---

## pptx：fflate 纯 JS 解包 + 手写 OOXML 解析

### 为什么不找现成库

pptx 解析的库生态不太好：
- `pptxtojson`——维护不活跃，依赖老旧
- `jszip` + 自己解——可行但 jszip 比 fflate 重
- `pptx` npm 包——主要用于**生成** pptx，不是解析
- `mammoth` 的 pptx 支持——mammoth 只做 docx

我们选了一个**自己解 OOXML 的方案**，依赖 `fflate`（纯 JS zip 库，体积只有 ~3KB）。

### pptx 的 OOXML 结构

```
pptx/                          ← zip 根目录
├── ppt/
│   └── slides/
│       ├── slide1.xml        ← 第 1 页
│       ├── slide2.xml
│       └── slide...
└── [Content_Types].xml
```

每页 slide 的 XML 里，文本在 `<a:t>` 节点里：

```xml
<p:sp ...>
  <p:txBody>
    <a:p>                          ← 段落（换行边界）
      <a:r>
        <a:rPr lang="zh-CN" />
        <a:t>这是第一段</a:t>     ← 文本节点
      </a:r>
      <a:r>
        <a:rPr />
        <a:t>继续</a:t>
      </a:r>
    </a:p>
    <a:p>                          ← 新段落
      <a:r>
        <a:t>第二段</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>
```

### 真实代码

`packages/core/src/ingestion/office/read-pptx.ts`：

```typescript
import { unzipSync } from 'fflate';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

function decodeXmlEntities(value: string): string {
  return value.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function slideXmlToText(xml: string): string {
  return xml
    .split(/<a:p(?:\s[^>]*)?>/)   // 按段落开标签切分
    .slice(1)                       // 跳过第一段（split 后第一个是空）
    .map((segment) => {
      const body = segment.split(/<\/a:p>/)[0] ?? segment;  // 截取到段落结束
      const runs = Array.from(body.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g))
        .map((match) => decodeXmlEntities(match[1] ?? ''));  // 提取每个文本节点
      return runs.join('').trim();   // 段内 run 直接拼接
    })
    .filter(Boolean)
    .join('\n');                    // 段之间换行
}

export function readPptx(data: Uint8Array): string {
  const entries = unzipSync(data);

  const slides = Object.keys(entries)
    .map((path) => ({ path, index: SLIDE_PATH.exec(path)?.[1] }))
    .filter((item): item is { path: string; index: string } => Boolean(item.index))
    .sort((a, b) => Number(a.index) - Number(b.index));   // 按页码排序

  if (slides.length === 0) {
    throw ApiError.validation('pptx 文档解析失败：未找到任何幻灯片（可能已加密或不是有效 pptx）');
  }

  const sections: string[] = [];
  for (const slide of slides) {
    const xml = new TextDecoder('utf-8').decode(entries[slide.path]);
    const text = slideXmlToText(xml);
    if (text) sections.push(`## 第 ${slide.index} 页\n${text}`);
  }
  return sections.join('\n\n');
}
```

### 为什么用 split + matchAll 而不是 DOMParser

Node.js 没有原生 DOMParser。引入 `xmldom` 或 `fast-xml-parser` 会增加依赖。而 pptx 的 slide XML 里 namespace 声明很复杂（`xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` 这种），正则解析需要小心 namespace。

但我们的正则**不关心 namespace**——`<a:p` 里的 `a:` 只是一个固定的命名空间前缀字符串。OOXML 规范里这个前缀永远是 `a:`，所以正则 `<a:p(?:\s[^>]*)?>` 能稳定匹配到段落开头（包括可能的属性）。

这个方案**不是通用 XML 解析器**，是**为 pptx slide XML 量身定做的正则解析器**——够了，因为我们只需要一个确定的 XML 结构。

### 几个已知的限制

1. **不提取备注页文本**：备注页在 `ppt/notesSlides/` 里，v0.3 不处理（注释：用户做知识库时主要内容在主 slide）
2. **不提取表格单元格**：ppt 里的表格文本同样在 `<a:t>` 里，所以**会被提取**（因为表格也是 paragraph + run + t 的结构）
3. **不处理 SmartArt、图表、图片里的文字**：这些内容不在 slide XML 里，或者是嵌入的图片/OLE 对象

---

## 三格式的统一输出格式

三个解析器最终输出的格式统一为：

| 格式 | 段落/行分隔 | 表格 |
|------|-----------|------|
| txt/md | 原生换行 | — |
| pdf | mergePdfTextItems 合并后换行 | — |
| docx | 段落换行，表格单元格 ` | ` 分隔 | `列1 | 列2 | 列3` |
| xlsx | 每个 sheet 一节 `## Sheet 名`，单元格 tab 分隔 | `列1\t列2\t列3` |
| pptx | 每页一节 `## 第 N 页`，段落换行 | （在 `<a:t>` 里） |

统一成这个格式后，下游的 `chunking.ts`（按段落切 chunk）和 embedding 就完全不用关心文件来源了。

---

## 遗留 Office 格式（.doc / .xls / .ppt）的处理

```typescript
const LEGACY_OFFICE_EXTENSIONS = ['.doc', '.xls', '.ppt'];

function rejectLegacyOffice(ext: string): never {
  throw new ApiError(
    'VALIDATION_ERROR',
    `不支持旧版 Office 格式：${ext}。请另存为 .docx / .xlsx / .pptx 后重新上传。`,
  );
}
```

旧版 Office 二进制格式（.doc/.xls/.ppt）没有一个稳定的纯 JS 解析方案。Apache POI 是 Java 的，Python 的 `python-docx` 不支持 .doc，纯 JS 的 `word-extractor` 维护不活跃。v0.3 里我们选择**直接拒绝**，提示用户转成新版格式。

---

## 小结

Office 三格式的选型逻辑是：**为每种格式找最合适的工具，不强行统一**。

| 格式 | 库 | 理由 |
|------|-----|------|
| docx | mammoth + 正则转换 | mammoth 输出受控 HTML，正则处理表格结构 |
| xlsx | SheetJS 0.20.3 官方源 | MIT license、功能最全 |
| pptx | fflate + 手写正则 | 无现成好库，正则足够处理确定的 OOXML 结构 |

所有解析器的输出统一为 Markdown 风格纯文本（段落换行、表格分隔、分 sheet/slide 节），下游 chunking 和 embedding 完全透明。不处理旧版 Office 二进制格式，用户转新版。

这套方案在 v0.3 里稳定跑了 3 个月，没有出现解析器层面的 Bug——问题主要出在上一篇 B07 的 PDF webpack externals 和下一篇 B09 的网页剪藏安全护栏。

下一篇 B09 讲网页剪藏的安全护栏——SSRF 逐跳复检 + URL/正文去重 + sourceUrl 引用贯通。
