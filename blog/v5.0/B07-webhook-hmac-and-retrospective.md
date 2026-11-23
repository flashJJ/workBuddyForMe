# Webhook 验签：原始 body、时间窗与密钥轮换

Webhook 只带一个 Bearer Secret，能用，但不够：

- 密钥在每次请求里明文传输（即使走 HTTPS，也容易被日志记录）；
- 无法证明请求体没被篡改；
- 无法防重放。

v5.0 给 Webhook 增加可选 HMAC：`authMode=bearer|hmac|both`。

## 一、签名格式

请求头：

```text
x-wbfm-timestamp: 1795456800
x-wbfm-signature: <hex>
```

签名输入：

```text
HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
```

输出小写 hex。把时间戳纳入签名，攻击者改动时间戳也会导致验签失败。

## 二、为什么必须读原始 body

很多框架会先 `JSON.parse` 再交给业务。JSON 重新序列化后键顺序、空格、转义都可能变，签名就对不上。

正确顺序：

1. clone 请求；
2. 读原始文本；
3. 验签；
4. 验签通过后再 `JSON.parse`。

这也是公开 Webhook 路由要单独处理的原因：不能复用已经解析过 body 的通用处理器。

## 三、时间窗与常量时间比较

```ts
if (!/^\d{1,12}$/.test(timestamp)) return false;
if (Math.abs(now - ts * 1000) > 300_000) return false;
return timingSafeEqual(expected, signature);
```

- 300 秒窗口，覆盖时钟漂移与网络延迟；
- 先校验时间戳格式，避免 `NaN`；
- 签名比较用常量时间，避免计时侧信道；
- 缺头、过期、错误签名统一 401，不区分具体原因。

## 四、三种模式

| 模式 | 行为 |
|---|---|
| `bearer` | 只认 `Authorization`，行为与旧版一致 |
| `hmac` | 只认签名头，Bearer 不再生效 |
| `both` | 两者都必需 |

`both` 适合迁移期：外部系统先加签名，确认稳定后再去掉 Bearer。

## 五、密钥怎么存与轮换

验签需要服务端持有明文密钥，不能只存哈希。v5.0 新增 `secret_cipher`：

- 用本机 `SecretCipher` 加密；
- 轮换时同一事务更新 `secret_hash` 与 `secret_cipher`；
- 新 Secret 只返回一次；
- 旧密钥立即失效。

旧触发器只有 hash、没有 cipher，因此启用 HMAC 前必须先轮换；缺密文时返回 409 并提示 `flow/hmac-secret-unavailable`，而不是静默降级成 Bearer。

## 六、测试清单

- 合法签名通过；
- 错误签名 401；
- 时间戳超出 300s 401；
- 缺时间戳/签名 401；
- `both` 模式缺 Bearer 401；
- 轮换后旧签名立即失效；
- 缺密文时启用 HMAC 被拒绝；
- Bearer 模式回归不受影响。

## 七、复盘：兜底能力的共同形状

v5.0 五条链路看起来分散，其实形状一致：

1. **先固化事实**：运行开始写图快照，失败先分类，请求先读原始 body；
2. **再给明确出口**：快照缺失就阻断，错误不可重试就不补偿，签名不对就 401；
3. **最后留痕**：补偿、清理、工具拒绝、验签失败都有审计或状态；
4. **不静默降级**：不回退生产图、不把 HMAC 降成 Bearer、不把失败吞成成功。

这也是「会兜底」和「加重试」的区别：重试只是动作，兜底需要事实、边界与可追溯性。

## 八、边界

- HMAC 不替代 HTTPS；
- 不做请求体加密；
- 不做多密钥并行验证；
- 不做签名版本协商；
- 300 秒窗口固定，不开放配置。
