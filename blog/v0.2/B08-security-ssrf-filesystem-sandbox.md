---
title: "安全红线：工具调用链的 SSRF 防护、文件系统访问白名单、命令执行沙箱"
series: "WorkBuddy For Me v0.2 技术拆解"
number: "B08"
tags: ["security", "ssrf", "sandbox"]
date: "2025-Q4"
---

# 安全红线

## 为什么工具调用打开了新的攻击面

v0.1 的 WorkBuddy For Me 是一个"被动回答"的助手——模型只能基于用户输入和知识库片段生成文本，没有任何对外动作。这种情况下的安全边界很清晰：**模型是只读的、输出只到前端**。

v0.2 引入工具调用后，这个边界破了。`fetch_webpage` 让模型的输出可以驱动应用去**主动发起 HTTP 请求**；如果未来加了文件系统工具，模型可能驱动应用去**读/写本地文件**；如果加了命令执行工具，甚至可能**执行 shell 命令**。此时安全边界变成了：**模型 → 工具调用 → 外部动作**。中间任何一环松了，都可能变成攻击面。

v0.2 的安全设计围绕一个核心原则：**工具执行链路必须在模型可影响的范围之外有独立的安全校验层**。模型的 JSON Schema 是"告诉模型该传什么参数"，不是"保证参数安全"——模型可能幻觉一个 URL、可能诱导应用去请求内网、可能尝试路径遍历。这些都不能仅靠 JSON Schema 的 `pattern: ^https://` 来防。

## SSRF：fetch_webpage 的核心防线

`fetch_webpage` 是 v0.2 里风险最高的工具——如果模型被诱导请求 `http://169.254.169.254/latest/meta-data/`（AWS/GCP 云元数据）或 `http://127.0.0.1:6379/`（本地 Redis），桌面应用跑在用户机器上，等于把本地网络暴露给了模型的输出。

v0.2 的 SSRF 防护实现在 `packages/core/src/tools/ssrf-guard.ts`，分三层：

### 第一层：URL 字面量校验

```typescript
export function assertSafeUrlLiteral(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SsrfBlockedError(`非法 URL：${urlString}`);
  }
  // 协议白名单：仅 http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`仅允许 http/https 协议：${url.protocol}`);
  }
  // 主机名为 IP 字面量时直接判定
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ipCheck = isBlockedIp(host);
  if (ipv4ToInt(host) !== null || host.includes(':')) {
    if (ipCheck.blocked) throw new SsrfBlockedError(ipCheck.reason ?? '目标地址被拦截');
  }
  return url;
}
```

协议白名单拦住 `file://`、`ftp://`、`gopher://`（虽然 fetch 本身不支持这些协议，但显式白名单更安全）。主机名如果是 IP 字面量（比如 `127.0.0.1`），直接过 CIDR 判定；如果是域名，放行到下一层（DNS 解析阶段校验）。

### 第二层：CIDR 命中判定

IPv4 覆盖了所有私网/回环/保留段：

```typescript
const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],       // 本网段
  ['10.0.0.0', 8],      // 私网 A 类
  ['100.64.0.0', 10],   // CGNAT
  ['127.0.0.0', 8],     // 回环
  ['169.254.0.0', 16],  // 链路本地（含云元数据 169.254.169.254）
  ['172.16.0.0', 12],   // 私网 B 类
  ['192.168.0.0', 16],  // 私网 C 类
  ['192.0.0.0', 24],    // IETF 保留
  ['192.0.2.0', 24],    // TEST-NET-1
  ['192.88.99.0', 24],  // 6to4 中继
  ['198.18.0.0', 15],   // 基准测试
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24],  // TEST-NET-3
  ['224.0.0.0', 4],     // 多播
  ['240.0.0.0', 4],     // 保留
];
```

IPv6 覆盖了 fc00::/7（唯一本地）、fe80::/10（链路本地）、ff00::/8（多播），以及 `::ffff:0:0/96` IPv4-mapped 尾段内嵌的 v4 地址（如果是 `::ffff:127.0.0.1` 也会被拦截）。

CIDR 命中判定是个纯函数，100% 可单测——`ssrf-guard.test.ts` 覆盖了所有边界值（`127.0.0.0`、`127.255.255.255`、`169.254.0.0`、`169.254.255.255`、公网 IP `8.8.8.8`、`1.1.1.1`）以及 IPv6 边界（`::1`、`fc00::1`、公网 `2001:4860::8888`）。

### 第三层：DNS 解析校验（防 DNS rebinding）

主机名为域名时，光看字面量不行——攻击者可能让域名先解析到公网 IP（通过字面量校验），然后在 fetch 之前切换到内网 IP（DNS rebinding）。

WorkBuddy For Me 的做法是**在发请求前立即做 DNS 解析，校验所有解析结果**：

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

注意 `{ all: true }` 拿到所有解析结果——有些域名返回多个 A 记录（负载均衡），只要有一个命中内网就拦截。

### 第四层（隐藏层）：重定向逐跳复检

URL 校验通过后，请求发起了。但 302 重定向可能跳到内网——比如 `http://evil.com/redirect?url=127.0.0.1` 先返回 302 到 `http://127.0.0.1/admin`。

WorkBuddy For Me 不用 fetch 内置的自动跟随（`redirect: 'follow'`），而是**手动跟随、每跳都过 SSRF 校验**（`packages/core/src/net/safe-web-fetch.ts`）：

```typescript
export async function followRedirects(initial: URL, signal: AbortSignal) {
  let current = initial;
  for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',  // 不自动跟随
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      // 关键：重定向目标也要重新走 SSRF 校验
      current = await assertEveryHop(new URL(location, current).href);
      continue;
    }
    return { response, finalUrl: current };
  }
}
```

`assertEveryHop` = 协议白名单 + IP 字面量判定 + DNS 解析校验。这样不管重定向链多长（上限 3 跳），每一跳都被校验。

## 文件系统与命令执行：v0.2 不做

安全设计里一个容易被忽略的点是：**"不做某些功能"也是安全措施**。v0.2 明确不做两类工具——文件系统访问和命令执行。原因不是技术做不到，而是它们的安全边界太宽：

- **文件系统**：即使做了路径白名单，模型仍然可能通过路径遍历（`../../etc/passwd`）或符号链接绕过；文件系统 API 还可能意外泄露本地应用的内部数据（配置文件、密钥）。
- **命令执行**：沙箱隔离的复杂度极高——桌面应用怎么给一个 shell 做隔离？Docker 容器引入太重；PTY 权限控制在不同 OS 上行为不一致；即使用户授权，"给模型一个 shell"本身就是一个危险的设计。

v0.2 的三个工具（`current_time`、`knowledge_search`、`fetch_webpage`）覆盖了"查时间 → 查知识库 → 查公开网页"的闭环。**读、只读、完全不碰本地文件系统和 shell**。这不是功能阉割，而是安全边界的明确选择。如果 v0.3 要做文件系统工具，必须引入独立的路径沙箱层（类似 VSCode 的 `workspace.fs` 权限模型）和用户确认弹窗（每个写操作都需要用户显式批准）。

## 参数层：双重校验

`fetch_webpage` 的参数在进入 SSRF 防护之前还有一层 zod schema 校验：

```typescript
const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});
```

这层的作用是**提前拦截明显非法的参数**（空字符串、超过 2000 字符的 URL），把问题暴露在工具执行器而不是 SSRF 层。两层校验的设计：

| 层 | 职责 | 失败时的行为 |
|----|------|-------------|
| zod schema | 参数格式合法性 | 抛 ToolArgError，执行器归一为 ok:false 结果回灌模型 |
| SSRF guard | 安全边界 | 抛 SsrfBlockedError，同样被执行器归一化 |

注意两者的**归一化方式是一样的**——都变成 `ok:false, output:'...'` 的 ToolResult 回灌模型。模型看到 "抓取失败：目标地址 127.0.0.1 命中内网/保留网段 127.0.0.0/8" 后，会放弃用工具直接回答。不会因为安全校验失败而向用户暴露原始错误栈。

## SsrfBlockedError：安全异常的类型隔离

```typescript
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}
```

这个自定义异常类让我们可以在 `fetch_webpage` 的 catch 里区分"SSRF 拦截"和"其他抓取失败"：

```typescript
try {
  fetched = await safeFetchWebPage(parsed.data.url, ctx.signal);
} catch (error) {
  if (error instanceof SsrfBlockedError) {
    return {
      ok: false,
      output: `抓取失败：目标地址被安全策略拦截。仅支持公开 http/https 网页。`,
      summary: '安全拦截',
    };
  }
  // 其他错误...
}
```

用户看到的不会是"127.0.0.1 命中 127.0.0.0/8"这种技术细节，而是"目标地址被安全策略拦截"这种友好提示。同时后端日志（如果有的话）会打出完整的 SSRF 错误信息供调试。

## 超时与大小：资源耗尽防护

安全不只关注"做危险的事"，还要关注"做太多事"。`safeFetchWebPage` 里有三个硬限制：

```typescript
export const WEB_FETCH_TIMEOUT_MS = 8_000;
export const WEB_FETCH_MAX_BYTES = 200 * 1024;
export const WEB_FETCH_MAX_REDIRECTS = 3;
```

- **8 秒超时**：防止模型诱导请求一个慢速地址（比如故意挂一个 30 秒才返回的服务器），拖慢整个对话。
- **200KB 上限**：响应体超过 200KB 直接拒绝。防止模型请求一个超大文件（比如 `http://example.com/large.zip`），或者让网页正文撑爆 token 窗口。
- **3 跳重定向**：防止无限重定向链或重定向炸弹。

加上工具执行器本身的 **15 秒默认超时**（`TOOL_TIMEOUT_MS`），整个 fetch_webpage 工具的最坏执行时间约为 `3 * 8s + 解析时间 ≈ 25s`，仍然在 15 秒工具超时的覆盖内。

## 小结

v0.2 工具调用链的安全设计核心是"**分层 + 显式拒绝 + 不做**"：

| 威胁 | 防护层 | 机制 |
|------|--------|------|
| SSRF IP 字面量 | CIDR 硬编码白名单 | 纯函数、100% 单测 |
| SSRF DNS rebinding | fetch 前 DNS 解析 | `{ all: true }` 所有结果校验 |
| SSRF 重定向跳转 | 手动跟随 + 逐跳复检 | `redirect: 'manual'` + assertEveryHop |
| 参数注入 | zod schema | 提前拦截明显非法参数 |
| 资源耗尽 | 8s 超时 + 200KB 上限 + 3 跳 | 有界资源使用 |
| 文件系统/命令执行 | v0.2 不实现 | 最安全的工具是不存在的工具 |

所有安全失败都归一为 `ok:false` 的 ToolResult 回灌模型，不向用户暴露内部错误细节。B09 会转到工程话题：TS strict + 单文件≤300行 + 外部调用 mock 的三层门禁实战。
