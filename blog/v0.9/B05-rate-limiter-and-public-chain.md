# 每密钥限流器：固定窗口 + LRU，零依赖的够用主义

本地 API 为什么需要限流？调用方是本机程序，看起来「都是自己人」。但真实威胁模型里有两类失控来源：浏览器页面里的脚本（XSS/恶意页面借环回地址打你的服务）和陷入死循环的 buggy 脚本。LLM 流程每次调用都可能烧 token、花几十秒，没有任何闸门的公开端点等于把一个昂贵执行器裸奔在环回口上。

v0.9 给每个端点配了独立限流，默认 30 次/分，可在 1–600 之间配置。这篇讲实现和取舍。

## 固定窗口计数：朴素但性质清楚

```ts
check(endpointId, limitPerMin) {
  const now = Date.now();
  const counter = windows.get(endpointId);
  if (!counter || now - counter.startedAt >= WINDOW_MS) {
    windows.set(endpointId, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  counter.count += 1;
  if (counter.count <= limitPerMin) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - counter.startedAt)) / 1000) };
}
```

为什么不用令牌桶/滑动窗口？评估了实际诉求：

- 限流目的是**熔断失控调用**，不是精确计费。固定窗口在边界处最多放过 2×limit（窗口末尾一波 + 新窗口开头一波），对本地 LLM 流程完全可接受——最坏两分钟 120 次而不是 60 次，不构成安全事件；
- 固定窗口的语义用户能直接理解：「每分钟 N 次」，UI 上也是这么写的；
- 实现无状态歧义，窗口过期直接重置，Retry-After 可以直接从窗口起点算。

超限响应：

```text
HTTP 429
Retry-After: 60
{ "error": { "code": "rate_limited" } }
```

实测在把配额调到 2/min 时，序列严格是 `200,200,429(retry-after=60),429`。

## Map 无界增长怎么办：LRU 10000

如果每个见过的 endpointId 都在 Map 里留一个窗口，长期运行会缓慢膨胀（每次重置密钥产生新 id）。做了个最小 LRU 淘汰：

```ts
while (windows.size >= MAX_KEYS) {
  const oldest = windows.keys().next().value;  // Map 按插入序
  if (oldest === undefined) break;
  windows.delete(oldest);
}
```

插入新窗口时才淘汰，最久没活动的端点先丢（丢了无所谓，下次请求开新窗口）。上限 10000 对本地应用是天文数字，存在纯粹是为了给内存占用一个确定性的上界。

## 限流在链路中的位置

公开路由的中间件顺序是有意安排的：

```text
1. assertLoopbackHost  Host 白名单（DNS rebinding）
2. authenticate       bearer 密钥（404 混淆防枚举）
3. rateLimit          每端点窗口计数
4. handler            invoke / runs / mcp
```

鉴权在限流之前：匿名/坏密钥请求在限流处之前就被 401/404 挡掉，攻击者没法靠乱发请求把别的端点窗口刷满（计数键是鉴权后的端点 id，不是请求方 IP——环回场景 IP 全相同，按 IP 限没有意义）。

注意限流是在 handler 外层、按**请求**计数的：一次 invoke 无论最终执行多久、成功失败，都只算一次。这样成本可控且可预测，不和执行时长耦合。

MCP HTTP 承载复用完全相同的链（只是 transport 标记为 `'mcp'`，要求端点开启 MCP 协议位），所以 MCP 调用共享同一配额，不需要两套配置。

## 路由层：definePublicRoute 的薄封装

所有公开路由用一个工厂包起来，把横切逻辑集中：

```ts
export const POST = definePublicRoute('http', async ({ request, services, endpoint }) => {
  // 到这里：Host 合法、密钥有效、未超限、endpoint 已注入
});
```

- 错误响应用独立的公开包络（`{success:false,error:{code,message,details?}}`），与内部 ApiError 体系物理隔离；
- 全部异常归一，公开面绝不把堆栈或内部错误信息透出去；
- handler 拿到的是已鉴权的端点视图，不用每个路由重复查密钥，也不可能漏掉某道闸门——新增公开路由时安全检查是免费的。

这层「薄」很重要：它不做业务、不碰流程执行，只负责把请求安全地送到 handler 门口。限流策略以后要升级（比如加突发桶），只动这一个文件。

下一篇进入 MCP：一个纯函数处理器怎么同时支撑 HTTP 和 stdio 两种承载。
