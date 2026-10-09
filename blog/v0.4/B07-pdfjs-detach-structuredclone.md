# pdf.js detach 血案：structuredClone transfer 如何吃掉你的 ArrayBuffer

这是一个「测试全绿、真机全灭」的经典坑：罪魁祸首不是我们的代码，而是一个对库行为的错误假设——传给 pdf.js 的输入缓冲，默认会被它「吃掉」。

## 案件现场：单测全绿，真机全灭

给我们的桌面 AI 应用做图片型 PDF OCR 时，链路是：pdf.js 渲染页面成 PNG → 视觉模型/tesseract 逐页识别。开发完成后单测 9 例全绿，合并前做真机端到端验证——**两份真实扫描件，全部失败**。

现象非常诡异：

- 单页 PDF 正常；
- 多页 PDF **第一页正常，第二页起全部抛错**；
- 视觉路线和 tesseract 路线同时失败——两条路唯一的公共部分就是 pdf.js 渲染。

报错信息是 `DataCloneError: Cannot transfer object of unsupported type`。这个错误名当时完全没引起警觉——我们没有手动 transfer 任何东西。

## 定位：插桩 Worker.prototype.postMessage

排查的第一步是把「哪一层挂的」切清楚。OCR 链路有四层：runner 编排 → pdf.js 渲染 → canvas 光栅化 → 模型识别。单测里 pdf.js 和 canvas 都是 mock 的，所以单测绿不能证明渲染层健康——**mock 全绿只证明你的编排逻辑对，不证明你的依赖行为对**。

在 Node 脚本里独立复现后，对 `Worker.prototype.postMessage` 插桩打调用栈，真相浮出：

```text
pdf.js 在 Node 环境没有真 worker，走 fake-worker 的 LoopbackPort
  → LoopbackPort.postMessage 内部执行：
      structuredClone(obj, { transfer: [data.buffer] })
  → transfer 语义：缓冲的所有权被移交，原对象被 detach
  → 输入的 Uint8Array 在第一次 getDocument 之后 byteLength 变成 0
```

关键在 `structuredClone` 的 transfer 选项：它不是「拷贝」，是**移交**。被 transfer 的 ArrayBuffer 在原侧立即失效（detached），`byteLength` 归零，任何后续读写都抛错。

而 runner 初版是这样写的：

```typescript
// ❌ 每页渲染重新打开同一份 PDF 数据
for (const pageNumber of pageNumbers) {
  const doc = await pdfjs.getDocument({ data }).promise;  // 第二次起 data 已 detach
  const page = await doc.getPage(pageNumber);
  // ... render
}
```

第一页：`getDocument(data)` → pdf.js 内部 transfer → `data` 被吃掉，但这次渲染用掉了，正常产出。第二页：再传同一个 `data`——已经是 byteLength=0 的空壳，`structuredClone` 尝试 transfer 一个 detached buffer → `DataCloneError`。

独立脚本验证只用了五行：

```javascript
const data = new Uint8Array(await fs.readFile('scan.pdf'));
const doc1 = await pdfjs.getDocument({ data }).promise;
console.log(data.byteLength);  // 0  ← 已被吃掉
await pdfjs.getDocument({ data }).promise;  // 💥 DataCloneError
```

## 修复：两个层面

**修复一（止血）：所有 getDocument 传副本。**

```typescript
// pdf-render.ts（修复后）
const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
```

`data.slice()` 产生一个新缓冲，detach 的是副本，调用方持有的原件安然无恙。文字层提取路径同样修。

**修复二（结构）：整份 PDF 只打开一次。**

```typescript
export async function renderPdfPagesToPng(
  data: Uint8Array,
  pageNumbers: readonly number[],
  scale: number,
  maxPixels?: number,
): Promise<RenderedPdfPage[]> {
  const doc = await pdfjs.getDocument({ data: data.slice(), ... }).promise;
  try {
    for (const pageNumber of pageNumbers) { /* 逐页渲染，复用同一个 doc */ }
  } finally {
    await doc.destroy();
  }
}
```

即使有了副本兜底，「每页重新 getDocument」也是错的：PDF 解析（xref 表、字体、对象图）是有成本的，20 页文档解析 20 次纯属浪费。重构后 runner 每引擎只打开一次文档，批量渲染全部目标页（产出 `Map<pageNumber, png>`），再逐页送识别。`ocr-runner.test.ts` 里有一条专门的防回归断言：**「整份 PDF 只批量渲染一次」**——把这次事故的教训固化成了测试。

## 为什么 mock 测不出来

这个 bug 值得深想的一层是：它在单测体系里是**结构性不可见**的。

单测约定是「外部调用一律 mock」——pdf.js 被 mock 成一个返回固定 page 对象的对象。mock 的行为是**我们想象的行为**：拿数据、返回文档、随便调用多少次都行。而真实 pdf.js 的 transfer 语义是一个我们没想象到的行为。

这不是说 mock 错了——mock 仍然是编排逻辑的最佳测试方式。而是说：**凡是带所有权语义的 API（transfer、stream、文件描述符、锁），mock 一定会把所有权语义抹平**。这类 bug 只有两种防线：

1. **真机端到端验证留在交付流程里**。这次教训之后，项目宪法加了一条：涉及原生模块和本地模型的链路，mock 全绿只是入场券，真机实测才是交付线。OCR 修复后真实扫描件 8 秒识别双页、文本完整入库，这个验收动作后来写进了每一个涉及摄入链路的交付清单。
2. **输入缓冲的所有权视为移交而非出借**。调用任何带 worker/transfer 语义的库，传入的数据默认当作「会被吃掉」——要么传副本，要么调用方不再使用原件。这条已写进项目记忆。

## 同案的另外两个小坑

真机排查过程顺带修了两个同模块的问题：

- **`OcrFailedError` 吞掉 cause**：自定义错误构造只存 message，底层的 DataCloneError 被吃掉——排查初期看到的报错完全没有上下文。修复为 `(message, { cause })` 透传错误链。**错误类不透传 cause，等于主动掐断未来的排查线索。**
- **tesseract 重复 terminate 抛异常**：worker 在正常结束路径和超时兜底路径都会被 terminate，第二次调用抛 rejection。修复为吞掉重复终止。**清理逻辑必须幂等**——超时兜底和正常收尾同时触发清理是并发系统的常态。

## 小结

这个 bug 的完整画像：一个正确的库行为（structuredClone transfer 是标准语义）、一个错误的调用假设（输入缓冲可复用）、一套恰好掩盖它的测试策略（mock 抹平了所有权语义）、一次兜底了它的流程（真机端到端验证）。四层任何一层变化都会改变故事走向——这也是它值得单独成篇的原因：它是「测试策略边界」的最佳标本。

下一篇 B08 讲 OCR 链路的另一个真机坑：本地视觉模型的像素预算——870 万像素的 A4 扫描件如何撞穿 qwen2.5-vl 的 4096 上下文。
