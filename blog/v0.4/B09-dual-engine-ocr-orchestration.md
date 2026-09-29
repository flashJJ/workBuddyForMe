---
title: "双引擎 OCR 编排：视觉优先、tesseract 兜底、partial 语义与三层超时"
series: "WorkBuddy For Me v0.4 技术拆解"
number: "B09"
tags: ["workbuddy", "ocr", "tesseract", "orchestration", "timeout"]
date: "2025-Q4"
---

## 编排问题：一个 PDF 里可能有两种页

图片型 PDF OCR 的输入比想象中复杂。真实世界的 PDF 不是「纯扫描件」或「纯文字版」二选一——**混合体是常态**：封面是扫描图、正文是文字层、附录又是照片。所以编排的第一层不是「选引擎」，而是**逐页判定**：

```typescript
// read-document.ts
const sparsePages = pageTexts
  .filter((p) => pageNeedsOcr(p.text))   // < 50 字符/页判为需要 OCR
  .map((p) => p.pageNumber);
```

文字层稠密的页保留原文（pdfjs 提取的文字层永远比 OCR 准），只有稀疏页送 OCR。最终 `assembleText` 按页序合并两路文本：**OCR 是补缺，不是替换**。这个设计让混合 PDF 的识别质量天然最大化，也让「50 页文档只有 3 页扫描图」的常见 case 只花 3 页的 OCR 成本。

---

## 引擎选择：视觉优先，tesseract 兜底

```text
resolveVisionTarget(deps) 存在？
  ├─ 是 → 视觉引擎（qwen2.5vl 等）
  │         └─ 零产出且致命失败 → 降级 tesseract
  └─ 否 → tesseract（WASM 离线，chi_sim+eng）
```

为什么视觉优先？v0.3 已经建好了视觉基础设施（vision target 解析、image_url wire、Ollama 真机验证），视觉模型对混排、低清、手写体的识别质量显著优于 tesseract。tesseract 的价值定位是**离线降级**：零网络、零模型配置，装了应用就能用。

降级条件的措辞值得精确：**视觉引擎「零产出且致命」才降级**（`vision.fatal && ocrByPage.size === 0`）。视觉模型中途失败但已有部分产出时，不降级——重新用 tesseract 跑一遍已成功的页是浪费，且两引擎混排的文字风格不一致。这里的判断标准是「哪些错误重试能救回来」：

| 失败类型 | 策略 | 理由 |
|---|---|---|
| 视觉路线渲染失败 | fatal，整份降级 | pdfjs/canvas 挂了，重试无意义 |
| 视觉单页识别失败 | 跳过该页，continue | 模型偶发，下一页可能好 |
| tesseract 渲染失败 | break | 同上，整份层面的问题 |
| tesseract 单页超时 | break（worker 已脏） | worker 状态不可信，不可复用 |

注意 tesseract 单页超时是 break 而不是 continue——超时后的 WASM worker 内部状态不可信，继续用它识别后续页面可能返回脏数据。**降级与终止的粒度必须匹配组件的可复用性语义。**

---

## partial：49/50 页成功不是失败

旧设计的倾向是整篇二值：成功或 failed。但考虑真实场景：50 页扫描件，49 页识别成功、1 页超时——把整份文档判死、49 页内容不可检索，是对用户最差的结果。

v0.4 引入 `partial` 状态：

```typescript
return {
  text,
  engine,
  partial: partial || capped || timedOut || ocrByPage.size < targets.length,
  processedPages: ocrByPage.size,
  totalPages,
};
```

partial 的触发条件有四种：单页跳过、超 50 页截断（`capped`）、总超时、以及最终产出页数少于目标页数。partial 文档**照常分片入向量库**、可被 RAG 命中，UI 上给琥珀色「部分 OCR」徽标——检索可用性与诚实标注不矛盾。

配套的状态契约走 v004 加法迁移：`documents` 加 `ocr_status`（running/done/failed/skipped）与 `ocr_engine`（vision/tesseract）两列，老文档一律 NULL 表示「非 OCR 来源」。延续项目铁律：只 ADD COLUMN，不改已有列、不回填数据。

---

## 三层超时：页、文、外部取消

OCR 是长任务（50 页扫描件视觉识别可能跑 10 分钟），超时设计分三层，各自独立：

```text
OCR_PAGE_TIMEOUT_MS  = 30s    单页识别上限，超时跳过该页
OCR_TOTAL_TIMEOUT_MS = 5min   全文总预算，超了收尾为 partial
OCR_MAX_PAGES        = 50     页数硬顶，超出截断并标 partial
```

实现上用 `AbortSignal.any()` 组合三根信号线：

```typescript
const pageSignal = AbortSignal.any([
  rootSignal,              // 外部取消（用户中断）
  deadlineSignal,          // 总预算 deadline
  AbortSignal.timeout(OCR_PAGE_TIMEOUT_MS),  // 单页超时
]);
```

三段信号语义不同，处理也不同：单页超时 → 跳过继续；总超时/外部取消 → 已有产出收尾为 partial。tesseract 路径不能复用 `AbortSignal.timeout`（WASM worker 不认 AbortSignal），用 `Promise.race` 版的 `withPageTimeout` 兜底——同一个超时语义，两种实现机制，编排层对调用方屏蔽这个差异。

两个收尾细节：总 deadline 的 `setTimeout` 在 finally 里 `clearTimeout`（否则进程退出前定时器挂着）；外部 signal 的 listener 也要 removeEventListener。**长任务编排的资源清理和主逻辑同等重要**——这些不抛错的泄漏会在长跑应用里慢慢积累。

---

## 失败的用户体验：OCR_GUIDANCE_MESSAGE

两条引擎都不可用、或最终全文为空时，抛 `OcrFailedError(OCR_GUIDANCE_MESSAGE)`。这个提示语是设计过的：不是「OCR failed」，而是告诉用户能做什么——「该 PDF 为扫描件且未配置视觉模型，请在设置中添加视觉模型（如 qwen2.5vl）后重试」。本地优先产品的报错文案必须自带出路，因为用户没有客服可找。

---

## 小结

双引擎 OCR 编排的核心决策：逐页判定而非整份二选一（混合 PDF 是常态）、视觉优先但零产出才降级（重试要判断救不救得回）、partial 是一等状态（检索可用性与诚实标注并存）、三层超时三种处理（粒度匹配组件可复用性）。整个 [ocr-runner.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/ingestion/ocr-runner.ts) 250 行，是这个项目里「错误处理密度」最高的文件——OCR 链路的每一环都可能失败，编排层的价值就是给每种失败配一个体面的结局。

下一篇 B10 收官：v0.4 复盘——一个人的项目怎么给数据设计「出口」。
