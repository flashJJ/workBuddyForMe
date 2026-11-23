# 本地 AI 应用的密钥怎么存：safeStorage 桥接设计

本地优先的 AI 助手要求用户填入 OpenAI 兼容服务的 API Key 才能对话。于是第一个安全问题绕不开：**这个 Key 到底存哪？** 明文写进配置文件，和把密码贴在显示器上的便利贴没有本质区别。

这篇讲一个单用户桌面 AI 应用的密钥方案：系统密钥链加密落盘、出参永不返明文、本地服务再加一层令牌守卫。不防国家级攻击，防的是日常威胁模型里那几类真实风险。

## 先排除错误答案

- ❌ 明文存 JSON 文件——任何能读你硬盘的程序都能拿到；
- ❌ 存 localStorage——前端能读，一旦 XSS 就全线失守；
- ❌ 存环境变量——重启就没，用户体验差，也不适合「填一次长期用」的场景；
- ✅ **加密后落盘，运行时解密**。

## 双实现：桌面用系统能力，Web 用同等强度

### 桌面端：Electron safeStorage

Electron 提供 `safeStorage`，底层调用操作系统密钥链（Windows DPAPI / macOS Keychain / Linux libsecret）加密。最大的好处是：**密钥材料本身不需要应用管，系统替你存**。

```ts
// 主进程
const ciphertext = safeStorage.encryptString(plaintext);
const plaintext = safeStorage.decryptString(ciphertext);
```

但有个架构上的错位：`safeStorage` 只能在**主进程**调用，而业务逻辑跑在 fork 出去的 Next 子进程里。子进程天然拿不到 `safeStorage`。

### 解法：一次性 cipher 桥

主进程启动时，在本地起一个**一次性 HTTP 服务**（只监听 127.0.0.1 随机端口，带随机 token 鉴权），只干一件事：加解密。

```text
主进程 safeStorage
    ↑ 加解密请求（带 token）
    │
cipher 桥（127.0.0.1 随机端口，一次性 token）
    ↑
    │  --require 引导脚本注入子进程
    ↓
Next 子进程（core 服务调用 cipher 桥）
```

子进程通过 `--require` 注入一个引导脚本，里面封装了向 cipher 桥发请求的加解密函数。core 服务调用时，密钥通过本地 HTTP 回到主进程，由 safeStorage 加解密后再返回。

**密钥明文永远只在主进程内存里出现一瞬**，子进程手里只有密文或解密后的瞬时值，不落任何日志。

### Web 端：AES-256-GCM

没有系统密钥链可用时（纯 Web 模式），用 AES-256-GCM。密钥文件放在应用数据目录的 `keys/` 下，权限设 0600（仅所有者可读写）。

```ts
// Web 模式的 cipher
const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
```

两套实现对上同一个 cipher 接口，业务层不感知自己跑在哪种交付模式下。

## 脱敏出参：永远不返回明文

这是另一条铁律：**任何 API 响应都不能包含明文 Key**。

仓储层为此拆成两个方法：

- `list()` / `get()`：返回脱敏视图，只有 `hasApiKey: boolean` 和 `apiKeyMasked: string`；
- `getRow()`：返回含密文的完整行，**只有服务层在需要解密时才调用**。

脱敏函数：

```ts
// 保留前 3 位和后 4 位，中间替换为 ****
// sk-abcdef123456 → sk-****3456
function maskSecret(secret: string): string {
  if (secret.length <= 7) return '****'; // 太短直接全遮
  return secret.slice(0, 3) + '****' + secret.slice(-4);
}
```

集成测试里专门有断言：供应商列表接口的响应体中，绝不出现 `apiKey` 明文。安全规则不靠人记住，靠测试钉死。

## 令牌守卫：本地服务也要鉴权

桌面端的内置服务跑在 127.0.0.1 随机端口，但**本机其他进程、甚至浏览器里的网页都能向这个端口发请求**，回环地址不等于安全边界。所以加一层令牌守卫：

- 主进程生成随机 bearer token（控制通道令牌）；
- 启动子进程时注入 `APP_SERVER_MANAGED=1` 和 `APP_TOKEN`；
- 所有 `/api/*` 请求校验 `x-app-token` 头，不对就 401；
- token 通过 preload 暴露给前端（`window.app.token`），由前端自动带上，不放进 URL。

```ts
// token-guard.ts
if (process.env.APP_SERVER_MANAGED !== '1') return; // 纯 Web 模式放行
const token = req.headers['x-app-token'];
if (token !== process.env.APP_TOKEN) {
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
```

非托管模式（直接 `next dev`）不校验，方便日常开发。

## 威胁模型：我们防的是谁

这套设计不追求滴水不漏，只覆盖单用户本地应用的真实威胁面：

- 本机其他进程偷读 Key 文件（加密落盘 + 0600 权限）；
- 恶意网页跨进程调用本地服务（令牌守卫）；
- XSS 窃取 Key（接口永不返回明文）；
- 日志意外泄露 Key（统一脱敏 + 不打印）。

对一个本地单用户应用，这个防护强度与威胁量级是匹配的。

## 小结

本地 AI 应用的密钥安全，三层防护：

1. **加密落盘**：桌面走 safeStorage 系统密钥链，Web 走 AES-256-GCM；
2. **永不返回明文**：出参统一脱敏，密文只允许服务层在内存中瞬时解密；
3. **本地服务鉴权**：随机端口 + bearer token，防本机其他进程跨进程调用。

下一篇讲私域知识库：不部署任何向量数据库，怎么用 SQLite + sqlite-vec 撑起百篇文档量级的 RAG。
