---
title: "网页剪藏的安全护栏：SSRF 逐跳复检 + URL/正文去重 + sourceUrl 引用贯通"
series: "WorkBuddy v0.3 技术拆解"
number: "B09"
tags: ["workbuddy", "web-scraping", "ssrf", "security", "dedup", "source-url"]
date: "2025-Q4"
---

## 从 fetch_webpage 工具到网页剪藏

v0.2 里已经有一个 `fetch_webpage` 工具——模型可以调用它去拉网页内容回答问题。到 v0.3 M3 网页剪藏时，我们遇到了一个选择：

> 是给剪藏重新写一套 URL 校验 + fetch + 去重的逻辑，还是和 `fetch_webpage` 工具共用一套基础设施？

我们选了后者。原因很简单：**安全逻辑绝不能分叉**。

`packages/core/src/net/safe-web-fetch.ts` 是两者的公共模块，位于 `packages/net/` 目录——独立于 `tools/` 和 `ingestion/`，任何人都可以用它。剪藏入口（`document-service.ts` 的 `clipWebpage`）和 `fetch_webpage` 工具（`fetch-webpage-tool.ts`）都 import 这同一个文件。

```typescript
// safe-web-fetch.ts 是唯一的实现
export async function safeFetchWebPage(urlString: string, signal?: AbortSignal) { /* ... */ }
export async function assertEveryHop(urlString: string) { /* ... */ }
export async function followRedirects(initial, signal) { /* ... */ }
export async function readBoundedText(response, signal) { /* ... */ }
```

这篇按调用顺序讲每一层护栏。

---

## 护栏 1：URL 静态校验（assertSafeUrlLiteral）

任何 URL 进入系统的第一步。`packages/core/src/tools/ssrf-guard.ts`：

```typescript
export function assertSafeUrlLiteral(urlString: string): URL {
  let url: URL;
  try { url = new URL(urlString); }
  catch { throw new SsrfBlockedError(`非法 URL：${urlString}`); }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`仅允许 http/https 协议：${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ipCheck = isBlockedIp(host);
  // 字面量 IP 直接判定；是域名则交给 DNS 阶段
  if (ipv4ToInt(host) !== null || host.includes(':')) {
    if (ipCheck.blocked) throw new SsrfBlockedError(ipCheck.reason ?? '目标地址被拦截');
  }
  return url;
}
```

### 做了什么

1. **协议白名单**：只允许 http/https，拒绝 `file://`, `ftp://`, `chrome-extension://` 等——防止模型诱导用户上传本地文件
2. **字面量 IP 直接判定**：如果 URL 是 `http://127.0.0.1:3000/` 或 `http://169.254.169.254/latest/meta-data/`，不需要 DNS 解析直接拦
3. **IPv4 CIDR 黑名单**：`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`（含云元数据地址）、`0.0.0.0/8` 等
4. **IPv6 校验**：展开 16 字节数组，拦截 `::/128`（未指定）、`::1`（回环）、`fc00::/7`（唯一本地）、`fe80::/10`（链路本地）、`ff00::/8`（多播），以及 `::ffff:0:0/96` IPv4-mapped（按内嵌 v4 判定）

### 为什么分「字面量 IP 直判」和「域名 DNS 解析」

- 字面量 IP 能被 `ipv4ToInt` 解析出来 → 直接判定，**不做 DNS lookup**（没有 DNS rebinding 风险）
- 是域名（`ipv4ToInt(host) === null`）→ 留给 `resolveAndAssertHost` 做 DNS 解析后再判定

这样 `http://127.0.0.1/` 永远不会触发 DNS 请求，也就不可能被 DNS rebinding 攻击。

---

## 护栏 2：DNS 解析时校验（resolveAndAssertHost）

```typescript
export async function resolveAndAssertHost(hostname: string): Promise<void> {
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new SsrfBlockedError(`域名解析无结果：${hostname}`);
  for (const record of records) {
    const check = isBlockedIp(record.address);
    if (check.blocked) throw new SsrfBlockedError(check.reason ?? `域名解析到内网地址：${record.address}`);
  }
}
```

### 为什么要对 DNS 所有返回结果逐一校验

一个域名可能有多个 A 记录：`example.com → [203.0.113.1, 203.0.113.2, 10.0.0.1]`。如果只校验第一个，可能漏掉内网地址。所以 `dns.lookup({ all: true })` 拿全部 A/AAAA 记录，**任何一个被拦截就整体拒绝**。

### DNS rebinding 的防护边界

DNS rebinding 攻击链是：

```
1. 攻击者控制域名 evil.com 的 DNS
2. 第一次解析 → 返回公网 IP（通过我们的校验）
3. 我们 fetch evil.com → 攻击者这次返回 127.0.0.1
4. fetch 打到 127.0.0.1 → SSRF
```

我们的防护方式是：
1. 在发起 fetch **之前**做一次 DNS 解析校验（护栏 2）
2. fetch 时让 Node.js 的 HTTP 客户端再做一次 DNS 解析（这是 Node 内部的，我们不控制）

理论上存在一个小窗口：**护栏 2 的 DNS 解析结果和 fetch 时的 DNS 解析结果不一样**——但这个窗口很小（我们是手动 followRedirects，不会触发 DNS 缓存），加上护栏 1 的协议白名单和字面量 IP 直判，实际攻击面非常有限。

如果要更彻底，应该在 fetch 时用 `dns.lookup` 的结果**直接做 IP 连接**（绕过系统 DNS），但 Node.js 的 `http.Agent` 不暴露这个能力。v0.3 先不做，等未来真的遇到 rebinding 攻击再加。

---

## 护栏 3：逐跳重定向复检（followRedirects）

这是最关键的一层。很多 SSRF 攻击链是：

```
http://trusted-cdn.com/redirect  → 302 → http://internal:8080/secret
```

CDN 的公网 IP 通过了第一次校验，但 302 跳转后的内网地址没被检查。我们用**手动跟随重定向**而不是让 `fetch` 自动 follow，就是为了在每跳都做一次完整校验：

```typescript
export async function followRedirects(initial: URL, signal: AbortSignal) {
  let current = initial;
  for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {   // ≤ 3 跳
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',                                         // 手动 follow
      signal,
      headers: { accept: 'text/html, text/plain' },
    });

    if (response.status >= 300 && response.status < 400) {
      if (hop === WEB_FETCH_MAX_REDIRECTS) throw new Error('重定向超过 3 跳');
      const location = response.headers.get('location');
      if (!location) throw new Error('重定向响应缺少 Location');

      const nextUrl = await assertEveryHop(new URL(location, current).href);
      current = nextUrl;   // 下一轮用校验过的 URL
      continue;
    }
    return { response, finalUrl: current };
  }
}
```

### 设计点

1. **`redirect: 'manual'`**——不允许 fetch 自动 follow，我们自己控制
2. **`assertEveryHop`**——每跳都做完整的「协议白名单 + 字面量 IP 直判 + DNS 解析校验」
3. **最多 3 跳**——`WEB_FETCH_MAX_REDIRECTS = 3`，太多跳说明有问题（反爬、无限重定向）
4. **3xx → 非 3xx 的切换**——一旦拿到非重定向响应就返回，不继续 follow

### 一个真实的 SSRF 攻击案例如果没这层护栏

```
1. 用户提交剪藏：http://google.com/
2. 我们校验 google.com → 公网 IP → 通过
3. 发起 fetch，收到 302 → http://169.254.169.254/latest/meta-data/
4. 如果自动 follow → 拿到 AWS/GCP 云元数据 → 泄露实例凭证
```

有了逐跳复检：第 2 跳时 `assertEveryHop('http://169.254.169.254/...')` → 护栏 1 识别出 169.254 → 抛 `SsrfBlockedError` → 拒绝。

---

## 护栏 4：8 秒超时 + 200KB 有界读取

```typescript
export const WEB_FETCH_TIMEOUT_MS = 8_000;
export const WEB_FETCH_MAX_BYTES = 200 * 1024;  // 200KB

export async function readBoundedText(response: Response, signal: AbortSignal) {
  // 内容类型校验：只接受 html/plain/charset=
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !/text\/html|text\/plain|charset=/i.test(contentType)) {
    throw new Error(`不支持的内容类型：${contentType.split(';')[0]}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应体不可读');

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > WEB_FETCH_MAX_BYTES) throw new Error('页面超过 200KB 上限');
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('读取被中断');
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}
```

### 为什么 8 秒 + 200KB

- **8 秒超时**——公开网页的正常响应时间：DNS 解析 + TTFB + 完整下载都在 8 秒内完成。超时太长会被用来做 SSRF 慢速攻击（让我们的 worker 被长时间占用）
- **200KB**——超过 200KB 的 HTML 页面非常罕见（正常文章页面几十 KB）。超过上限说明：可能是反爬页面、下载链接、或者是一个巨大的 SPA bundle（剪藏 SPA 本来也提取不到内容）
- **内容类型校验**——拒绝 `application/json`, `image/*`, `application/pdf` 等（剪藏只处理 HTML 和纯文本）

### 为什么用手动 reader 而不是 `response.text()`

`response.text()` 会把整个 body 一次性读进内存，没有大小限制。用 `body.getReader()` 手动分块读，可以在每块累加后检查是否超过 200KB——一旦超限立即中断。

---

## 去重层：URL 规范化 + 正文 hash 去重

URL 和正文的去重发生在剪藏入口 `document-service.ts` 的 `clipWebpage` 方法里：

```typescript
// 去重 1：URL 规范化后查 documents.source_url
const canonical = normalizeUrl(url);   // 去 utm/fragment/多余参数
const existing = await documentRepo.findBySourceUrl(kbId, canonical);
if (existing) return existing;        // 秒传，已存在就不重复 ingest

// fetch + 提取正文
const article = await fetchArticle(url);  // 内部用 safeFetchWebPage + readability

// 去重 2：正文 sha256 hash
const contentHash = sha256(article.text);
if (await documentRepo.findByContentHash(kbId, contentHash)) {
  // 同一篇文章不同 URL（镜像站）→ 返回已存在的 document
}

// 入库：记录 sourceUrl
const created = await documentRepo.create({
  knowledgeBaseId: kbId,
  filename: article.title,
  kind: 'clip',
  source: 'webpage',
  sourceUrl: canonical,               // ← 规范化后的 URL
  // ...
});
```

### URL 规范化（normalizeUrl）

```typescript
function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  // 去掉 utm_* 参数
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^utm_/.test(key)) url.searchParams.delete(key);
  }
  url.search = url.search.replace(/[?&]$/, '');
  // 去掉 fragment
  url.hash = '';
  // 小写 host
  url.hostname = url.hostname.toLowerCase();
  // 默认 http → 80，https → 443，去掉显式默认端口
  if ((url.protocol === 'http:' && url.port === '80')
   || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  return url.toString();
}
```

这样 `http://example.com/article?id=123&utm_source=twitter#comment-456` 和 `https://example.com:443/article?id=123` 会被规范化为同一个 URL——避免了不同分享渠道的同一篇文章被重复 ingest。

### 正文 hash 去重

同一个页面可能在不同域名有镜像（比如某公众号文章被转发到知乎专栏）。URL 去重会漏掉这种情况，所以加了正文 sha256——**正文完全相同就不重复 ingest**。

---

## sourceUrl 的贯通：从文档到 RAG 引用

sourceUrl 存在 `documents.source_url`（v003-multimodal 加的列），在整个检索链路中贯通：

### 存储

```sql
ALTER TABLE documents ADD COLUMN source_url TEXT;
```

### 写入（document-service.ts）

```typescript
sourceUrl: canonical,   // 规范化后的 URL
```

### 检索 SQL（vector.ts）

```sql
SELECT d.source_url AS sourceUrl
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.knowledge_base_id = ?
```

### 返回给前端（retrieval-service.ts）

```typescript
return {
  documentId: doc.id,
  ordinal,
  snippet: c.snippet,
  sourceUrl: doc.sourceUrl,   // ← 每一条 citation 都带来源 URL
};
```

### 前端渲染（knowledge-search-tool.test.ts 验证过）

知识卡片上显示「来源：[打开原文](sourceUrl)」，点击在新标签页打开原始网页。

---

## 与 fetch_webpage 工具的关系

两者共用 `safeFetchWebPage`，但上层用途不同：

| | fetch_webpage 工具 | 网页剪藏 |
|--|-------------------|---------|
| 调用方 | LLM function call | 用户 UI → document-service |
| 产出 | HTML → 提取文本 → 返回给模型 | HTML → 提取文本 → ingest 进知识库 |
| 去重 | 无（临时用一次） | 有（URL + 正文 hash） |
| sourceUrl | 不记录 | 写入 documents.source_url |

共用底层安全模块，上层各司其职。这样做的好处是：
- 安全护栏只维护一份——改一处两处受益
- 未来加新的 fetch 场景（比如定期刷新知识库），直接 import `safeFetchWebPage` 就行

---

## 安全护栏的防御矩阵

| 攻击类型 | 护栏 | 拦截方式 |
|----------|------|----------|
| 内网地址 SSRF（字面量 IP） | 护栏 1 | CIDR 黑名单直判 |
| 内网地址 SSRF（域名） | 护栏 2 | DNS 解析后 CIDR 校验 |
| 重定向 SSRF | 护栏 3 | 逐跳复检 |
| 慢速 SSRF（长时间响应） | 护栏 4 | 8 秒超时 |
| 大文件 SSRF（撑爆内存） | 护栏 4 | 200KB 有界读取 |
| 协议攻击（file://） | 护栏 1 | 协议白名单 |
| 云元数据 SSRF | 护栏 1 + 护栏 3 | 169.254.0.0/16 直判 + 重定向复检 |
| 重复 ingest | 去重层 | URL 规范化 + 正文 hash |

---

## 小结

网页剪藏的安全护栏有三个设计原则：

1. **底层安全逻辑绝不分叉**——`safeFetchWebPage` 是唯一实现，`fetch_webpage` 工具和剪藏都用它
2. **每一跳都重新校验**——重定向链里任何一跳都可能引入 SSRF，逐跳复检让攻击面变成每一跳各自独立防御
3. **有界优先**——时间（8 秒）、大小（200KB）、跳数（3 跳）全是硬上限，拒绝做无界操作

去重层在安全护栏之后——安全是准入门槛，去重是效率优化。两层解耦，互不干扰。

sourceUrl 的贯通让每一条 RAG citation 都能回到原文——这对知识管理产品很重要，用户需要知道 AI 的回答从哪来。

下一篇 B10 是最后一篇，三个真实线上 Bug 的复盘——pdfjs externals、Dialog z-index、PDF span 合并的完整踩坑记录。
