---
title: "分享脱敏纯函数：四种密钥形态的正则与「默认外发」威胁模型"
series: "WorkBuddy For Me v0.4 技术拆解"
number: "B04"
tags: ["workbuddy", "security", "sanitize", "regex", "threat-model"]
date: "2025-Q4"
---

## 威胁模型：先想清楚防什么

对话分享功能最危险的部分不是序列化，而是**内容外发时的信息泄露**。动手写代码前，先把威胁模型钉在墙上：

> 导出的分享文件，默认假设会被陌生人看到。

这句话直接推导出要防的泄露面：

1. **API 密钥**：用户在对话里贴过 `sk-xxx`（调试时太常见了），或者工具调用的参数摘要里有 Bearer token。
2. **本地路径**：`C:\Users\张三\.workbuddy-for-me\attachments\xxx.png`——路径本身泄露用户名，数据根目录结构泄露应用内部信息。
3. **知识库引用片段**：RAG 命中的 citation snippet 可能包含私人文档内容。这条我们不自动脱敏（无法判断什么是「私人」），但文件尾部的水印和导出动作本身是显式用户行为兜底。

注意什么不在威胁模型里：不防「用户自己故意分享密钥」（防不了也不该防），不防「拿到文件的人破解加密」（文件不加密，导出即明文）。脱敏的目标是把**无意识的泄露**在出口处拦下。

---

## 一个纯函数，四条规则

脱敏的全部实现是 [snapshot.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/share/snapshot.ts) 里的一个纯函数 `sanitizeShareText(input: string): string`。无依赖、无副作用，规则只有四条，每条独立单测：

### 规则 1：本地数据根目录路径 → `[REDACTED]`

这条最复杂，因为路径有**四种形态**，还有**正反斜杠变体**：

```typescript
const WIN_PATH_RE  = /[A-Za-z]:\\[^\s"'<>|*?]*\.workbuddy-for-me(?:\\[^\s"'<>|*?]*)?/g;
const UNIX_PATH_RE = /\/(?:home|Users)\/[^\s"'<>|*?]+\/\.workbuddy-for-me(?:\/[^\s"'<>|*?]*)?/g;
const TILDE_RE     = /~\/\.workbuddy-for-me(?:\/[^\s"'<>|*?]*)?/g;
```

（源码里目录名是从 `@wbfm/config` 的 `DATA_DIR_NAME` 动态构建的，见下文踩坑。）

除了这三种通用形态，还有一个更精确的入口：调用方把当前实例的**具体数据根路径**传进来（`dataRoot` 参数），先做精确串替换：

```typescript
if (dataRoot) {
  const variants = [dataRoot, dataRoot.replace(/\\/g, '/'), dataRoot.replace(/\//g, '\\')];
  for (const v of [...new Set(variants)].sort((a, b) => b.length - a.length)) {
    out = out.split(v).join(REDACTED);
  }
}
```

两个细节值得记住：

- **先长后短排序**。如果文本里同时出现 `C:\x\.workbuddy-for-me` 和它的子路径 `C:\x\.workbuddy-for-me\attachments`，先替换长的——否则短串先命中，长串剩下半截 `attachments` 残留，路径信息泄露一半。
- **正反斜杠都替换**。Windows 路径在 JSON 里会被序列化成 `\\`，在日志里可能是 `/`，三种变体逐一替换。`split().join()` 而不用正则，因为路径里的反斜杠在正则里是转义噩梦，字面量替换更快更稳。

### 规则 2：`sk-` 风格 API Key

```typescript
out = out.replace(/sk-[A-Za-z0-9_-]{12,}/g, REDACTED);
```

覆盖 OpenAI（`sk-`）、Anthropic（`sk-ant-`）、OpenRouter（`sk-or-`）等主流前缀。长度阈值 12 是故意放宽的——宁可误杀一段随机字符串（概率极低），不可放过一个短 key。

### 规则 3：Bearer / Basic 令牌

```typescript
out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${REDACTED}`);
```

注意替换结果保留了 scheme 词（`Bearer [REDACTED]`）。这不是洁癖——脱敏后的文本仍然要可读，「这里曾经有一个 Bearer token」这个信息本身对阅读者有价值。

### 规则 4：key/token/secret/password 赋值串

```typescript
out = out.replace(
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password)("?\s*[:=]\s*"?)[^\s"',;}]{6,}/gi,
  `$1$2${REDACTED}`,
);
```

这条覆盖三种常见形态：JSON（`"api_key": "xxx"`）、env（`TOKEN=xxx`）、HTTP header 风格。保留 key 名和分隔符（`api_key: [REDACTED]`），同样是为了可读性。值的长度阈值 6 是平衡：再短就可能是正常单词（`secret: no`）。

---

## 为什么脱敏逻辑只有一份

项目里有两个数据出口：**对话分享**（本篇）和**备份导出**（B02/B03）。两者对文本的脱敏需求完全一致。

`sanitizeShareText` 放在 core 的 share 模块，备份导出直接复用同一个函数——不是复制粘贴，是 import。**脱敏逻辑只有一份，意味着审计面只有一处**。安全相关代码最忌讳每个出口各写各的正则：规则升级时（比如某天要加「身份证手机号」规则），改一处漏一处的概率是 100%。

`sanitizeSnapshot` 负责把脱敏**递归套用到快照的所有文本字段**：

```typescript
return {
  ...snapshot,
  title: scrub(snapshot.title),
  messages: snapshot.messages.map((m) => ({
    content: scrub(m.content),
    parts: m.parts.map((p) => p.type === 'text' ? scrub(p.text) : p),  // 图片 dataUrl 不动
    toolTrace: m.toolTrace.map((t) => ({
      argsSummary: scrub(t.argsSummary),      // 工具参数摘要——最常藏 key 的地方
      resultSummary: scrub(t.resultSummary),
      error: t.error ? scrub(t.error) : undefined,
    })),
    citations: m.citations.map((c) => ({
      documentName: scrub(c.documentName),
      snippet: c.snippet ? scrub(c.snippet) : undefined,
      sourceUrl: c.sourceUrl ? scrub(c.sourceUrl) : undefined,
    })),
  })),
};
```

最容易漏的是 `toolTrace.argsSummary`——`fetch_webpage` 工具的参数摘要里就是完整 URL，带 token 的查询参数直接躺在里面。脱敏必须覆盖**结构化数据里的每一个字符串字段**，而不是只 scrub 消息正文。

---

## 踩坑：硬编码目录名被仓库不变量拦截

这个模块的初版（M2 提交）把 `.workbuddy-for-me` 字面量直接写死在正则里。当时测试全绿、评审通过、合并了。到 M3 开发时，turbo cache miss 触发全量重跑，`repo-invariants.test.ts` 炸了——这个测试专门扫描代码库里的硬编码数据目录名，强制所有路径出处统一走 `@wbfm/config` 的 `DATA_DIR_NAME`。

修复（`f15744f`）：

```typescript
import { DATA_DIR_NAME } from '@wbfm/config';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const DIR_RE = escapeRegex(DATA_DIR_NAME);  // 动态构建，禁止字面量
const WIN_PATH_RE = new RegExp(`[A-Za-z]:\\\\[^\\s"'<>|*?]*${DIR_RE}(?:\\\\[^\\s"'<>|*?]*)?`, 'g');
```

教训有两层：一是**不变量测试会迟到但不会缺席**（turbo 缓存让它在 M2 隐身、M3 才暴露）；二是正则里拼动态片段必须过 `escapeRegex`——目录名里如果有 `.` 之类正则元字符，不转义就是埋雷。

---

## 边界与取舍

脱敏是**尽力而为的字符串替换**，不是语义级安全产品。明确不做的：

- 不检测身份证号、手机号、银行卡——正则误报率高，且单用户场景下对话里贴这些的概率远低于贴 API key。
- 不解析 JSON 再逐字段判断——快照里工具参数可能是不完整的 JSON 片段，字符串正则更鲁棒。
- 图片 dataUrl 不做内容审查——超出字符串替换能力边界，属于用户显式行为。

这四条连同规则本身都写在函数 docstring 里。脱敏函数是安全边界，**边界的自我描述和边界本身一样重要**——下个版本的人要知道防了什么、没防什么，才敢往上叠功能。

---

## 小结

脱敏模块的全部复杂度收敛在一个 ~30 行的纯函数里，但设计决策密度很高：威胁模型先行（默认外发）、规则宁宽勿窄（长度阈值放低）、结果保留上下文（`Bearer [REDACTED]` 而非整体抹掉）、实现只有一份（分享/备份共用）、出处禁止硬编码（DATA_DIR_NAME 统一出口）。纯函数 + 逐规则单测的形态，让这块安全代码成为整个项目里最好测试、也最少出 bug 的模块之一。

下一篇 B05 讲分享链路的另一端：单文件 HTML 导出——内联 CSS、图片 data URL 内嵌、以及为什么导出的 HTML 不依赖任何外部资源。
