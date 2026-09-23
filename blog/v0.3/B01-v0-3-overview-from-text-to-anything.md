---
title: "从纯文本到什么都能读——WorkBuddy For Me v0.3 三板斧总览"
series: "WorkBuddy For Me v0.3 技术拆解"
number: "B01"
tags: ["workbuddy", "multimodal", "overview", "pdf", "ollama"]
date: "2025-Q4"
---

## 先回答：v0.3 为什么要「什么都能读」

v0.1 做了纯文本对话，v0.2 加上了工具调用和 Ollama 本地跑通。到 v0.3，一个朴素的问题被推到面前：

> 为什么我的 AI 助手连一张截图、一份 PDF、一个网页都读不了？

你在本地电脑上工作的时候，眼睛扫过的信息来源是图片、是 Word、是 Excel、是浏览器标签页——但助手只能看纯文本字符串。这堵墙必须砸穿。

v0.3 的主题就是「什么都能读」，三个模块一个比一个硬核：

| 模块 | 代号 | 解决的问题 |
|------|------|-----------|
| 视觉对话 | M1 | 聊天消息里带图片，让模型真的能看图 |
| Office + PDF 文档解析 | M2 | 知识库 ingestion 不只吃 txt/md，还要吃 PDF、docx、xlsx、pptx |
| 网页剪藏 | M3 | 浏览器看到的东西一键进知识库，URL 去重 + 正文 hash 去重 + 来源可追溯 |

三板斧，每一把都涉及跨层改动。这篇是总览，后续 B02~B10 每篇会把一个点拆到底。

---

## 三板斧之间的依赖关系

在进入每个模块之前，先理解它们的依赖拓扑很重要。因为 v0.3 里最容易踩的坑，就是某一个模块的底层设计默认了另外两个模块的存在。

```
                        ┌──────────────────────────┐
                        │  核心类型：ContentPart    │
                        │  (shared/types/)         │
                        └──────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐
     │ M1 视觉对话      │  │ M2 文档解析       │  │ M3 网页剪藏       │
     │ attachment-svc  │  │ ingestion-pipeline│  │ safe-web-fetch    │
     │ multimodal.ts   │  │ read-document.ts  │  │ fetch-article.ts  │
     └────────┬────────┘  └────────┬─────────┘  └────────┬──────────┘
              │                     │                      │
              └─────────────────────┼──────────────────────┘
                                    ▼
                        ┌──────────────────────────┐
                        │  Chat Orchestrator       │
                        │  turn-preparation        │
                        │  tool-runner + fallback   │
                        └──────────────────────────┘
```

最底层的是 **ContentPart 联合类型**（`packages/shared/src/types/content-part.ts`）——它是整个多模态契约的基石，M1 直接用，M2/M3 的 ingestion 虽然不直接用，但它们产出的文本最终通过 RAG 检索流入对话，也就间接触达了这个类型。

往上一层，三个模块各自有自己的服务层，最后在 `ChatOrchestrator` 那里汇合。但汇合的方式不是简单拼接，而是有一套「先门控、后流式」的编排顺序——后面 B03 会专门讲 `prepareUserTurn` 里的三道保险。

---

## M1：视觉对话——让 ChatMessage 长眼睛

### 核心改动：`ChatMessage.content` 类型扩展

```typescript
// packages/shared/src/types/content-part.ts
export type ContentPart = TextContentPart | ImageContentPart;

// packages/shared/src/types/domain.ts
interface ChatMessage {
  content: string;          // 老消息继续用 string，不强制迁移
  contentParts: ContentPart[];  // 新消息填 parts；parts 为空时回落 content
}
```

这个设计决策——**保留 `content` 作为纯文本回退，用 `contentParts` 作为多模态扩展**——是 v0.3 最重要的架构选择。它避免了全量数据迁移，老的对话记录零成本兼容。具体怎么做到的、以及为什么不能直接把 `content` 改成 `string | ChatContentPart[]`，B02 会展开。

### 附件存储的取舍

图片不进数据库。`AttachmentService.save()`（`packages/core/src/services/attachment-service.ts`）做三件事：

1. **校验**：MIME 白名单（`png/jpeg/webp`）+ 大小上限（`MAX_IMAGE_BYTES = 10MB`）
2. **sha256 去重**：同一张图秒传，不同对话引用同一个附件 ID
3. **落盘**：`attachments/<id>.<ext>` 明文存储，DB 只存元数据（filename / mimeType / byteSize / contentHash / storagePath）

为什么不存 base64？为什么不落 S3？为什么不加密？B04 会从威胁模型讲到具体代码实现。

### 视觉门控：422 而不是 200 后再报错

```typescript
// packages/core/src/chat/turn-preparation.ts
function assertVisionCapable(model, imageCount: number): void {
  if (imageCount > 0 && !model.capabilities.includes('vision')) {
    throw new ApiError('VALIDATION_ERROR', `当前模型「${model.displayName}」不支持图片...`);
  }
}
```

这个函数在 SSE 流打开之前（`prepareUserTurn` 里）就会被调用。如果用户选了纯文本模型却发了图片，**422 直接打回**，用户在 UI 上立刻就能看到「请切换到视觉模型」的提示——而不是等了 30 秒看到流里冒一个 error 事件。B03 会把这三道门一起讲清楚。

### Ollama 真机实测的好消息

Ollama 的 `/v1/chat/completions` 端点（2026 年实测，Ollama 0.4 + qwen2.5vl:7b）**原生支持 OpenAI 兼容的 `image_url` data URL**。我们一开始在代码里做了两层适配：如果 provider 是 Ollama，就把 `image_url.data` 转成原生 `/api/chat` 的 `images` 字段。实测之后发现完全不需要——删掉兼容层代码，data URL 直接透传，`prompt_tokens` 确实包含图像 token。adapter.ts 里保留了那段注释，供后人参考。B05 会把这个坑的完整排查链路写出来。

---

## M2：文档解析——从文本提取到知识库 ingestion

### 支持的格式

| 格式 | 解析器 | 来源 |
|------|--------|------|
| PDF | pdfjs-dist (legacy build + externals 修复) | Mozilla 官方 |
| docx | mammoth | 纯 JS，支持受控 HTML 输出 |
| xlsx | SheetJS 0.20.3 官方源 | SheetJS 社区 fork |
| pptx | fflate + OOXML 手写解析 | 不走任何重型 Office 库 |

### PDF 的三个坑

PDF 是这次最头大的模块，三个真实 Bug 都出在这里：

**坑 1：pdf.worker.mjs 相对路径被 Next bundler 篡改**

pdfjs-dist 的 legacy build 内部用相对路径 `./pdf.worker.mjs` 加载 worker。Next server bundling 之后，`pdf.mjs` 被丢到 `.next/server/vendor-chunks/`，相对路径找不到 worker，`getDocument()` 直接抛 `fake worker` 错误。

修法：在 `apps/web/next.config.mjs` 里把 `pdfjs-dist` 整个包设为 webpack externals，让 Node 运行时直接 `require` 原始文件，不经过 bundler 处理：

```javascript
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externals = [...(Array.isArray(config.externals) ? config.externals : [config.externals]), /^pdfjs-dist(\/.*)?$/];
  }
  return config;
},
```

**坑 2：中文 PDF 逐字换行**

很多中文 PDF（尤其是扫描件 OCR 后导出的）会把「这是一整行中文」拆成 15 个 `<span>这</span><span>是</span><span>一</span>...`，pdfjs 取出的 `TextItem.transform` 数组里，每个 span 的 y 坐标和字号都完全一致，但每个 str 就是一个单字。如果直接拼接就是一团乱麻。

修法：`mergePdfTextItems()`（`packages/core/src/ingestion/read-document.ts`）按 **y 坐标差 ≤ 1.5pt** + **字号差 ≤ 0.5** 合并同行，遇到变化就换行。测试覆盖了真实中文 PDF 样本。

**坑 3：`isEvalSupported: false`**

pdfjs 默认开启 eval，Next 生产环境 standalone 模式下会被 CSP 或 bundler 警告。显式关掉：`pdfjs.getDocument({ data, isEvalSupported: false })`。

三个坑在 B10 里会有线上 Bug 复盘，B07 专门讲 PDF intake 全链路。

### Office 三格式的选型

为什么 mammoth 不直接输出纯文本？为什么 SheetJS 要锁 0.20.3 官方源？为什么 pptx 自己用 fflate 手写解析？B08 会从每个库的实际表现和边界 case 讲起。

---

## M3：网页剪藏——安全护栏比功能更重要

### 与 fetch_webpage 工具共用 `safe-web-fetch.ts`

```typescript
// packages/core/src/net/safe-web-fetch.ts
export const WEB_FETCH_TIMEOUT_MS = 8_000;
export const WEB_FETCH_MAX_BYTES = 200 * 1024;
export const WEB_FETCH_MAX_REDIRECTS = 3;
```

剪藏入口和 `fetch_webpage` 工具**完全复用这个模块**，禁止分叉。每一次重定向跳都重新过 SSRF 校验（DNS 解析 + IP 段检查），8 秒超时，200KB 有界读取——超过就拒。

### URL 去重 + 正文 hash 去重

`document-service.ts` 里对网页剪藏做了两层去重：
1. URL 去掉 utm/参数/fragment 后（规范化），查 `documents.source_url` 已有记录就返回
2. 正文抽纯文本后算 sha256，与已入库 chunk hash 比对，相同正文不重复 ingest

### 来源可追溯

`source_url`（`sourceUrl`）字段在 v003-multimodal 迁移里加到了 `documents` 表。RAG 检索返回的 `Citation` 里带上 `sourceUrl`，前端能在知识卡片上直接「打开原文」。SQL 贯通了 `documents.source_url` → `chunks.document_id` → 检索结果。

B09 会完整展开这套安全护栏。

---

## 跨模块协同的两个坑

### 坑：模型不支持工具调用的 fallback

v0.2 里 `supportsTools` 是 provider 级别的布尔值。但 qwen2.5vl 这种多模态模型，**在 Ollama 上不支持 tools，但支持视觉**。结果是：assistant 开了工具 → 带 tools 请求 → 400 报错 → 用户一脸懵。

修法：`runProviderTurnWithToolFallback()`（`packages/core/src/chat/tool-runner.ts`）。先按 `assistant.knowledgeBaseId` 和 `supportsTools` 尝试带 tools 发请求，如果返回 400 且错误信息匹配 `does not support tools|tools? is not supported|unsupported tools?`，**自动去掉 tools 重试一次**。这个 retry 发生在流打开之前，不会有已产出的增量需要回滚。

### 坑：Dialog z-index 同级重叠

一个前端的、但确确实实出现在 v0.3 线上的 Bug：Radix Dialog 的 `DialogOverlay` 和 `DialogContent` 默认都是 `z-50`。当对话框内部再触发一个 Dialog（比如从「设置 → 模型管理 → 添加模型」），两个 DialogContent 会**同层级重叠**，后面打开的会被前面的挡住——因为 DOM 顺序前面的先渲染，后面的 `z-50` 在同级里排在后面，本该覆盖，但实际上因为 Radix Portal 是 append 到 body，定位有时不确定。

修法：把 `DialogContent` 提到 `z-[51]`，保持 `DialogOverlay` 在 `z-50`。这样同一个 Dialog 里 Content 一定盖过 Overlay，嵌套 Dialog 的 Content 也能正确叠在父级 Overlay 之上。改了一行 Tailwind class。

---

## 博客路线图

后续 9 篇会按「类型 → 存储 → 门控 → 真机 → 降级 → PDF → Office → 剪藏 → Bug 复盘」的顺序展开：

| # | 主题 | 重点 |
|---|------|------|
| B02 | ContentPart 联合类型实战 | 如何不破坏存量消息结构就扩展多模态 |
| B03 | 视觉对话编排 | assertVisionCapable + SSE 前校验 + 附件存在性的三道保险 |
| B04 | 附件存储的正确姿势 | 落盘 + sha256 + 威胁模型取舍 |
| B05 | Ollama 视觉模型真机踩坑 | data URL vs 原生 images 字段的实测链路 |
| B06 | 模型不支持工具时的优雅降级 | 400 自动去工具重试 |
| B07 | PDF intake 三大坑 | webpack externals + 中文逐字换行 |
| B08 | Office 三格式解析 | mammoth + SheetJS + fflate 选型 |
| B09 | 网页剪藏安全护栏 | SSRF 逐跳复检 + URL/正文去重 + sourceUrl |
| B10 | 三个真实线上 Bug 复盘 | pdfjs externals / Dialog z-index / span 合并 |

每篇都会引用 `packages/*/src/**/*.ts` 的真实相对路径和行号范围，不硬编码机器名。踩坑是真实的——这些代码都已经跑在 v0.3 生产环境里。

---

## 总结

v0.3 最值得说的不是功能本身，而是它背后**跨三层（shared types → core orchestrator → apps/web）同时改动而不崩**的过程。ContentPart 类型设计是地基，附件存储 + Ollama 真机是中间层的硬骨头，PDF externals 和 Dialog z-index 是应用层的小坑但很真实。

「什么都能读」说起来四个字，代码里是 12 个关键文件、3 个真实生产 Bug、以及至少 3 次推翻重来的设计决策。希望后续 9 篇能把这些都讲透。
