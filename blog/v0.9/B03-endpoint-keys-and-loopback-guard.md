# 端点密钥：sha256、恒定时间比较，以及为什么错密钥回 404

本地应用做对外 API，鉴权设计最容易犯两个错误：一是把「本地」当成「可信」（任何能访问本机端口的网页脚本/进程都算用户），二是在错误码和响应时序里泄露端点是否存在。这篇讲 v0.9 端点密钥体系的具体设计。

## 密钥长什么样

```text
wfk_40位hex（20 字节随机数）
```

前缀 `wfk_` 有三个用途：人眼可识别、代码库扫描时容易发现泄露的密钥、库里脱敏展示有统一短头（`wfk_` + 8 位 hex）。

生成用 Node 的 `randomBytes(20)`，整条注册链路：

```ts
const generated = generateEndpointKey();           // { key, keyHash, keyPrefix }
endpoints.create({ ..., keyHash: generated.keyHash, keyPrefix: generated.keyPrefix });
return { plaintextKey: generated.key };            // 明文只在这一个响应里出现
```

数据库里只有哈希和短前缀，UI 里永远显示 `wfk_cf473405…（已隐藏）`。明文密钥只在创建和重置那一刻返回一次，之后用户丢了就只能重置——和 PAT 的惯例一致。

## 存的是哈希，比的是恒定时间

校验时先对 bearer 做 sha256，再按哈希查表：

```ts
const row = endpoints.getRowByKeyHash(hashEndpointKey(key));
const matched = row ? verifyEndpointKey(key, row.keyHash) : false;
```

`verifyEndpointKey` 内部是 `timingSafeEqual(actualHex, expectedHex)`，等长 hex 字符串的比较时间不随匹配位置变化。查表用哈希而不是明文唯一索引，天然不泄露明文；即使拖库，拿到的也是无法直接冒用的哈希（20 字节随机数 + sha256，暴力破解没有意义）。

## 错密钥和停用端点，都回同一个 404

直觉写法可能是：密钥不存在 → 401，密钥对但端点停用了 → 403。但对一个运行在本机的服务来说，这等于告诉扫描者「这个 key 对应的端点曾经存在」「这个 key 是有效的但服务关了」——错误码本身成了枚举预言机。

v0.9 的判定顺序：

```ts
// 1. hash 查表 + 恒定时间比对，任一失败：404 endpoint_not_found
// 2. 行存在但 status !== 'enabled'：     404 endpoint_not_found（同样混淆）
// 3. transport 协议位未开：              409 endpoint_disabled
// 4. 工作流停用/未发布：                 409 workflow_not_published
// 5. 新版本待重新确认策略：              409 policy_revalidation_required
```

前两档合并成一个「端点不存在或已停用」。只有**证明持有有效密钥之后**，才告诉你 409 级别的业务状态。无 key/坏 key 的请求能拿到的信息被压到最少。

## Host 白名单：防 DNS rebinding

只绑 127.0.0.1 还不够。DNS rebinding 攻击里，一个公网域名先解析到公网 IP 让浏览器通过同源检查加载页面，再把域名切到 127.0.0.1，页面脚本就顶着 `Host: evil.example` 对你的本机服务发请求——浏览器会自动带上该源的 Cookie。

两道防线：

1. 公开路由校验 Host 头只允许 `127.0.0.1[:port]` / `localhost[:port]`（缺失 Host 也拒），Host 解析回退到 URL 是为了适配 undici 测试环境不透传 Host 的情况；
2. 公开路由**完全不读会话 cookie**，也不发任何 `Access-Control-Allow-Origin`。服务端 curl 不受影响，浏览器跨域脚本默认就发不进来，就算 rebinding 绕过同源检查，Host 校验也会拦掉。

（我们的冒烟脚本里 evil.example 用例在 node fetch 的 DNS 阶段就失败了，这个分支的正确性由路由单测覆盖。）

## 一条中间件链，和内部路由刻意分家

内部管理路由（UI 用）走 `defineRoute`：托管 token 校验、会话概念。公开路由走另一个文件 `definePublicRoute`：

```text
hostGuard → bearerAuth → rateLimit → handler
```

刻意不复用内部链路，是为了让「无会话、无 cookie、错误码独立」这些安全姿态在代码结构上就不可能被内部路由的改动带歪。公开错误体也不用内部的 ApiError 包络，用自己的一套 code（unauthorized / endpoint_not_found / rate_limited / validation_failed…）。

## 踩坑：instanceof 在跨 chunk 时撒谎

联调第一天，所有公开错误都返回 500。日志显示抛出的明明是 `PublicEndpointError: 端点不存在或已停用`，catch 里的 `instanceof PublicEndpointError` 却是 false。

根因：Next 的 `transpilePackages` 会把 workspace 包打进各路由的按需编译 chunk，全局容器（持有 endpointService 实例的旧 chunk）和公开路由（新 chunk）里的类声明不是同一个构造器。生产构建也可能出现多份模块实例。

修法不是想办法逼 Next 单例化，而是错误识别加一层不依赖构造器的判定：

```ts
if (error instanceof PublicEndpointError) return error;
if (error && typeof error === 'object' &&
    error.name === 'PublicEndpointError' &&
    typeof error.code === 'string' &&
    typeof error.status === 'number') {
  return error as PublicEndpointError;
}
```

`name` 是稳定字符串、`code/status` 做结构校验。MCP 处理器的 -32602 入参错误用了同样的模式。这个教训值得记住：**跨 bundle 边界传错误，别只靠 instanceof**。

下一篇讲公开 API 的调用语义：同步等待、超时转异步、轮询和只读 SSE 是怎么配合的。
