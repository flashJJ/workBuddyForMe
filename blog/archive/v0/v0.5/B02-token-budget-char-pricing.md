# 没有 tokenizer 的预算体系：按字符计价、CJK 双语价、用上次真实 completion 校准输出预留

## 问题：按条数截断为什么必然出错

我们那个本地优先的桌面 AI 助手，历史消息最早的处理方式是「保留最近 N 条」。这个策略简单、可预测，但有两个结构性缺陷：

**对长消息不公平**。一条 2000 字的代码审查回复和一条「好的」占用同样的条数额度。用户贴了三个文件让助手分析，第三轮之后第一个文件的内容就被顶出去了——而那恰恰是后续所有讨论的上下文。

**对模型上下文长度无感知**。qwen2.5:7b 的上下文是 32K，qwen2.5vl 是 128K（Ollama 默认又压到 4K），gpt-4o-mini 是 128K。同一个「保留 20 条」在 32K 窗口里可能浪费一半空间，在 4K 窗口里直接爆掉。

预算体系把这个问题改成预算问题：**上下文窗口是一笔总预算，system、工具声明、输出预留、历史消息各自扣费，历史在剩余预算内从新到旧连续装载**。这篇讲这套预算体系的估算基础——在没有真实 tokenizer 的约束下，怎么把「token 数」这个不可直接得到的量估得足够准。

## 第一层：字符计价，CJK 与非 CJK 分开算

本地部署场景不能假设有真实 tokenizer——Ollama 的 API 不暴露逐文本 tokenize 接口，引入 tiktoken 又只覆盖 OpenAI 系模型。`context-budget.ts` 的选择是按字符粗估，但**按字符类型分价**：

```typescript
export const CJK_CHARS_PER_TOKEN = 1.5;      // 中文 ≈ 1.5 字符/token
export const NON_CJK_CHARS_PER_TOKEN = 4;    // 英文等 ≈ 4 字符/token

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

export function estimateTokens(text: string): number {
  const cjk = text.match(CJK_PATTERN)?.length ?? 0;
  const other = text.length - cjk;
  return Math.ceil(cjk / CJK_CHARS_PER_TOKEN + other / NON_CJK_CHARS_PER_TOKEN);
}
```

为什么不统一按 4 字符/token？因为这个产品的主要语言是中文。中文的 token 密度远高于英文——「我喜欢编程」5 个汉字在主流 BPE 分词器下约 3-4 个 token，而同等语义的英文 "I love programming" 约 4-5 个 token 对应 18 个字符。统一按英文密度估，中文文本会被低估 2 倍以上，长对话直接在半路爆掉上下文。

CJK 正则覆盖了平假名/片假名、CJK 扩展 A、统一表意文字主区、兼容表意文字——基本命中所有日常中日韩文本。估出来的值偏保守（实际分词器对常见词组有合并），这在预算场景是正确方向：**宁可少装一条历史，不可超限被截断**。

## 第二层：消息的完整成本 ≠ 文本长度

一条消息的真实 token 成本由四部分构成，`estimateMessageTokens` 逐一计价：

```typescript
export const IMAGE_TOKEN_ESTIMATE = 512;          // 单张图片片段保守中值
export const PER_MESSAGE_OVERHEAD_TOKENS = 4;     // role 与分隔符的固定开销

export function estimateMessageTokens(message: ChatMessage): number {
  let tokens = PER_MESSAGE_OVERHEAD_TOKENS;
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      tokens += part.type === 'text' ? estimateTokens(part.text) : IMAGE_TOKEN_ESTIMATE;
    }
  }
  if (message.toolCalls?.length) {
    tokens += estimateTokens(JSON.stringify(message.toolCalls));
  }
  return tokens;
}
```

两个容易被漏掉的计价项：

**图片片段按固定 512 估**。视觉模型的图片 token 按像素切块计算，与实际图片尺寸相关——但预算组装时图片已经落库成 attachment，再去读尺寸太重。取保守中值 512（约对应像素预算压缩后的 1568px 图在 7B 视觉模型下的典型开销），比漏算强得多。

**tool_calls 按 JSON 序列化计价**。助手消息可能携带工具调用记录，这些 JSON 会原样回传给模型。漏算它，工具密集型对话（一次回答 3-4 轮工具调用）的历史成本会被低估 30%+。

## 第三层：输出预留给多少——用上次真实 completion 校准

预算公式里最微妙的一项是**输出预留**：`历史预算 = 上下文窗口 − system − 工具声明 − 输出预留`。预留少了，模型回答写到一半被截断；预留多了，历史被白白挤掉。

`resolveReserveTokens` 的做法是用**上一轮的真实 completion tokens** 校准：

```typescript
const OUTPUT_RESERVE_MARGIN = 128;

export function resolveReserveTokens(lastCompletionTokens: number | null): number {
  return lastCompletionTokens != null
    ? Math.max(OUTPUT_RESERVE_TOKENS, lastCompletionTokens + OUTPUT_RESERVE_MARGIN)
    : OUTPUT_RESERVE_TOKENS;   // 默认 2048
}
```

逻辑是：这个用户的对话风格决定了回答的典型长度。用户一直在要简短回答（上轮 completion 300 token），这轮就按 `max(2048, 300+128) = 2048` 预留；用户在让助手写长文档（上轮 3500 token），这轮按 3628 预留——下一轮大概率还是长回答。`OUTPUT_RESERVE_TOKENS` 兜底保证短对话风格下不会预留不足，`MARGIN 128` 吸收相邻轮次的长度波动。

这个值每轮滚动更新：本轮真实 completion 写入 `post-turn-jobs.ts` 的参数，供下一轮校准。预算体系因此有了**自适应能力**——长文档场景自动多留输出空间，问答场景自动把空间还给历史。

## 装配算法：从新到旧，连续装载，本轮恒保留

预算定了之后，装配本身刻意简单（`assembleHistoryWithinBudget`）：

```text
historyBudget = contextWindow − systemTokens − toolsTokens − reserveTokens
从最新一条（本轮用户消息）开始往前累计：
  - 本轮用户消息恒保留（即使它单独就超预算，也保证当前问题不丢）
  - 其余消息：装得下就装，装不下就停
保留的是一个连续后缀，不做跳跃式挑选
```

两个设计点值得说：

**为什么连续后缀而不是「挑重要的装」？** 对话的语义是连续的——第 10 轮的「就按这个方案做」依赖第 9 轮的方案内容。跳跃式挑选会保留「结论」丢掉「上下文」，模型拿到的历史自相矛盾。连续后缀保证模型看到的历史永远是真实发生过的对话尾部。**挑哪些是「重要的旧消息」是摘要的职责，不是装配的职责**。

**为什么本轮用户消息恒保留？** 边界场景：用户贴了一个 10 万字文档，单条消息就超整个预算。此时丢弃历史是必然的，但绝不能把用户刚发的问题也丢了——那是本轮存在的意义。代码里用 `i === history.length - 1` 特判，即使超预算也计入。

## 预算的「消费者」们：谁在给历史扣费

预算体系建立后，历史不再是预算的唯一消费者。完整的扣费顺序（与 `planCompaction` 共用同一套口径，见 `summarizer.ts`）：

```text
上下文窗口（模型 contextTokens，自动探测）
  − system 人设（助手 prompt）
  − 摘要块预留 512（SUMMARY_BLOCK_RESERVE_TOKENS）
  − 记忆块预留 512（MEMORY_BLOCK_RESERVE_TOKENS，助手开记忆时）
  − RAG 资料块（知识库检索结果）
  − 工具声明（enabledTools 的 schema JSON）
  − 输出预留（上次 completion 校准）
  = 历史预算
```

摘要块和记忆块的 512 预留是摘要与记忆功能落地时的关键决策：把它们作为**预留席位**写进预算，而不是事后「能塞多少塞多少」。没有预留，长对话场景下摘要和记忆会被历史挤得一个 token 都不剩——功能做了但永远不生效。

`contextTokens` 的来源是模型发现环节的增强：Ollama `/api/tags` 返回的模型详情里带上下文长度，发现时自动回填进模型配置；设置页同时保留手动填写入口，OpenAI 兼容供应商探测不到时就靠手填。

## 可观测性：stats 透传 LangSmith

装配过程返回完整的 `HistoryBudgetStats`（窗口大小、各项扣费、保留/丢弃条数、估算总量、是否截断），通过 `context_budget` span 透传到 LangSmith。调「为什么模型忘了前文」这类问题时，先看 stats：`truncated: true, droppedMessages: 14` 和 `truncated: false` 是两条完全不同的排查路径——前者是预算不够（该压缩了），后者是记忆/摘要注入的问题。

## 小结

预算体系的本质是承认三个现实：没有真实 tokenizer、输出长度因对话而异、上下文窗口是所有功能共享的稀缺资源。字符双语价估算解决第一个，上次 completion 校准解决第二个，预留席位制度解决第三个。三者叠起来，「保留最近 N 条」这个朴素策略就可以退役了。

但预算再精，窗口总是有限的——32K 装不下 100 轮对话时怎么办？下一篇 B03 讲递归摘要压缩：旧历史怎么折叠成摘要块、摘要怎么增量合并、为什么压缩失败必须降级为纯截断而不是报错。
