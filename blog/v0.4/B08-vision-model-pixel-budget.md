---
title: "本地视觉模型的像素预算：image token 桶、4096 上下文与 temperature 0"
series: "WorkBuddy For Me v0.4 技术拆解"
number: "B08"
tags: ["workbuddy", "ollama", "vision-model", "qwen", "token-budget"]
date: "2025-Q4"
---

## 真机现象：A4 扫描件稳定 400，缩小一圈才通

修复 pdfjs detach（B07）之后，视觉 OCR 链路终于真实跑起来了——然后立刻撞上第二个真机坑：

一张 A4 扫描件按 2x 缩放渲染（2480×3508，约 870 万像素），送给本地 Ollama 的 qwen2.5vl:7b，**稳定返回 400**。降到 1.5x、1.25x 还是 400，降到 1x 才通。

400 是请求格式错误，不是模型超时——说明请求在模型开始推理之前就被拒了。

---

## 根因：视觉模型的 token 不是按字节算的

排查绕了一圈（先怀疑 base64 编码、再怀疑消息结构），最后用同一图片直连 Ollama API 复现，排除了应用链路，定位到模型侧：

**qwen2.5-vl 按像素桶计算 image token，约 784 像素/token。**

算一下账：

```text
A4 @ 2x = 2480 × 3508 ≈ 870 万像素
870 万 ÷ 784 ≈ 4106 image token
Ollama 默认 num_ctx = 4096
4106 > 4096 → 请求直接 400
```

1.25x 和 1.5x 为什么也一样超？像素按平方缩放，但 token 按桶取整——1.25x 约 136 万像素 ≈ 1735 token……这倒不超。实际排查发现真正的解释是 qwen-vl 系列按 patch 网格对齐后的桶数比线性估算更高，总之 1.25x 以上全部落进「超 4096」的桶里。教训不是精确公式，而是：**本地视觉模型的上下文是硬顶，图片输入必须先过预算闸**。

---

## 修复：渲染前的像素预算

修复不是「换个更大上下文的配置」（Ollama num_ctx 可以调大，但 7B 模型在 32k 上下文下的显存与速度对普通机器不友好），而是**在渲染源头控制像素总量**：

```typescript
// packages/core/src/ingestion/pdf-render.ts
export const OCR_VISION_MAX_PIXELS = 2_000_000;  // 200 万像素 ≈ 2550 image token，留足余量

export function resolveRenderScale(
  baseWidth: number,
  baseHeight: number,
  requestedScale: number,
  maxPixels?: number,
): number {
  if (!maxPixels || maxPixels <= 0) return requestedScale;
  const basePixels = baseWidth * baseHeight;
  if (basePixels <= 0) return requestedScale;
  const maxScale = Math.sqrt(maxPixels / basePixels);  // 等比缩回
  return Math.min(requestedScale, maxScale);
}
```

流程变成：

```text
page.getViewport({ scale: 1 }) 读基准尺寸
  → resolveRenderScale(基准宽, 基准高, 期望 2x, 200 万像素上限)
  → A4: 870 万 > 200 万？不对——A4@1x 基准只有 1240×1754 ≈ 217 万，2x 是 870 万
    → maxScale = sqrt(200万 / 217万) ≈ 0.96 → 实际 scale = min(2, 0.96) = 0.96
  → 最终渲染约 200 万像素 ≈ 2550 token < 4096 ✅
```

值得注意的实测结论：**A4 页面渲染到 200 万像素，识别质量与 870 万像素无肉眼差异**——qwen2.5vl 对印刷体文字的识别在 150 万像素以上就饱和了。像素预算不只是「防爆」，顺手把推理时间也砍掉一半以上。`resolveRenderScale` 是纯函数，4 个单测覆盖了「不超不缩」「等比缩回」「零边界」。

---

## 第三个坑：temperature 0.6 的「随机漏行」

像素问题解决后，端到端走通了，但出现一个更灵异的现象：**每一页转录都恰好漏一行**。位置不固定，但每页必有。

第一怀疑对象是 SSE 增量解析丢 delta——v0.2 的流式链路自己实现的解析器，有过前科吗？排查方法论在这里起了决定性作用：

> **怀疑解析层之前，先用同一请求体绕开应用直连一次。**

用完全相同的 prompt、图片、参数，curl 直连 Ollama 的 `/api/chat`——返回的文本 4 行逐字完整，`finish_reason=stop`。解析层无罪释放。

那问题在哪？重跑应用管线一次，这次又完整了。两次结果不一致 + 请求体完全一致 = **采样波动**。Ollama 的默认 temperature 是 0.6——对创作任务合理的值，对 OCR 这种**确定性转录任务**是灾难：模型在每一行开头都有概率「跳过」。

修复是一行：

```typescript
// ocr-vision.ts：OCR 请求固定
temperature: 0
```

修复后真机回归逐字稳定。这个坑的教训被制度化：**所有「转录/抽取/结构化」类调用（OCR、记忆提取、zod JSON 输出）一律显式 temperature 0**，创作类调用才保留温度。「本地模型的默认参数是为聊天调的，不是为你的任务调的。」

---

## 两条防线写进了哪里

| 防线 | 位置 | 形式 |
|---|---|---|
| 像素预算 | `pdf-render.ts` `resolveRenderScale` | 纯函数 + 4 单测 |
| temperature 0 | `ocr-vision.ts` 请求构造 | 常量 + 断言测试 |
| 「先直连再怀疑解析层」方法论 | 项目记忆 + 本篇 | 流程约定 |

---

## 小结

本地视觉模型接入的三个真参数：image token 按像素桶算（784 像素/token）、上下文默认 4096 是硬顶、默认 temperature 0.6 对转录任务是 bug 源。对应的三个工程动作：渲染前像素预算（200 万像素 ≈ 2550 token，质量无损）、确定性任务温度归零、排查时先用直连请求把「模型行为」和「应用链路」切成两半。本地模型的好处是可控，代价是**每个默认参数都得自己重新审一遍**。

下一篇 B09 讲双引擎 OCR 的编排层：为什么视觉优先 tesseract 兜底、partial 状态语义、以及三层超时的层次设计。
