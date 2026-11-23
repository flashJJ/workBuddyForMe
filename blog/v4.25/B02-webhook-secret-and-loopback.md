# Webhook 鉴权：一次性 Secret 与回环守卫

给本地应用做 Webhook，最危险的误区是「先能用，安全以后再说」。这一版从第一行代码就把边界定死：**只允许本机访问，密钥只存哈希，创建时只展示一次**。

## 一、Secret 的生成与存储

每个 Webhook 触发器拥有独立密钥：

```ts
const secret = `wft_${randomBytes(32).toString('base64url')}`;
const secretHash = createHash('sha256').update(secret).digest('hex');
```

- 明文只在创建响应里返回一次；
- 数据库只保存 `secret_hash`；
- 鉴权时对调用方传来的 Bearer 再算一次 SHA-256，用 `timingSafeEqual` 比较。

```ts
export function verifyTriggerSecret(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashTriggerSecret(secret), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
```

长度不一致直接失败，避免 `timingSafeEqual` 抛错；比较过程不泄露前缀信息。

## 二、回环 Host 守卫

公开路由复用既有的 Host 校验：只接受 `127.0.0.1` 与 `localhost`。这挡住的是 DNS rebinding 一类攻击——浏览器里的恶意页面即使能解析到本机，也无法用外部域名把请求送进来。

路由链路固定为：

```text
Host 守卫 → 触发器 Secret 鉴权 → 限流 → 业务处理
```

## 三、请求约束

- 仅接受 `application/json`，其他类型 415；
- body 上限 256KB，超限 413；
- body 必须是 JSON 对象，数组与标量 422；
- 每触发器 30 次/分钟，超限 429 并带 `retry-after`；
- 未知或禁用触发器统一 404，避免泄露存在性；
- 错误包络与公开端点一致，不返回内部堆栈。

## 四、为什么不做 HMAC

HMAC 能防篡改与重放，但要求调用方实现签名逻辑。本机回环场景下，Bearer Secret 已经能挡住未授权调用；把 HMAC 留到未来有跨进程/跨设备需求时再加，避免第一版把接入成本抬得过高。

## 五、丢失密钥怎么办

不做轮换 UI，删除触发器再重建即可。这比「保留旧密钥 + 轮换状态机」简单得多，也符合本地应用的使用频率。
