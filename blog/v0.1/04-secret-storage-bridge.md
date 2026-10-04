# 本地 AI 应用的密钥保卫战：safeStorage 桥接设计

> API Key 明文落库？那和把密码写在便利贴上贴屏幕上有什么区别。

## 问题的本质

一个本地 AI 助手，用户要填 OpenAI 兼容服务的 API Key 才能对话。这个 Key 存在哪？

- ❌ 明文存 JSON 文件——任何能读你硬盘的程序都能拿到
- ❌ 存 localStorage——前端能读，XSS 就凉
- ❌ 存环境变量——重启就没，用户体验差
- ✅ **加密后落盘，运行时解密**

## 双实现：桌面用系统能力，Web 用同等强度

### 桌面端：Electron safeStorage

Electron 提供 `safeStorage`，用操作系统的密钥链（Windows DPAPI / macOS Keychain / Linux libsecret）加密。好处是：**密钥本身不需要你管，系统帮你存**。

```ts
// 主进程
const ciphertext = safeStorage.encryptString(plaintext);
const plaintext = safeStorage.decryptString(ciphertext);
```

但有个问题：`safeStorage` 只能在**主进程**用，而业务逻辑跑在 fork 出去的 Next 子进程里。子进程拿不到 `safeStorage`。

### 解法：一次性 cipher 桥

主进程启动时，起一个**本地一次性 HTTP 服务**（只监听 127.0.0.1，带随机 token 鉴权），专门干一件事：加解密。

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

子进程通过 `--require` 注入一个引导脚本，里面封装了向 cipher 桥发请求的加解密函数。core 服务调用时，密钥通过本地 HTTP 回到主进程，用 safeStorage 加解密，再返回。

**密钥明文永远只在主进程内存里出现一瞬**，子进程只拿到密文或解密后的瞬时值。

### Web 端：AES-256-GCM

没有系统密钥链可用时，用 AES-256-GCM。密钥文件存在数据根的 `keys/` 目录，权限设 0600（仅所有者可读写）。

```ts
// Web 模式的 cipher
const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
```

## 脱敏出参：永远不返回明文

这是另一条铁律：**任何 API 响应都不能包含明文 Key**。

仓储层分两个方法：
- `list()` / `get()`：返回脱敏视图，只有 `hasApiKey: boolean` 和 `apiKeyMasked: string`
- `getRow()`：返回含密文的完整行，**只有服务层在需要解密时才调用**

脱敏函数长这样：

```ts
// 保留前 3 位和后 4 位，中间替换为 ****
// sk-abcdef123456 → sk-****3456
function maskSecret(secret: string): string {
  if (secret.length <= 7) return '****'; // 太短直接全遮
  return secret.slice(0, 3) + '****' + secret.slice(-4);
}
```

集成测试里专门有断言：供应商列表接口的响应里，绝不出现 `apiKey` 明文。

## 令牌守卫：本地服务也要鉴权

桌面端的 Next 服务跑在 127.0.0.1 随机端口，但本机其他进程/网页也能访问。所以加了一层令牌守卫：

- 主进程生成随机 bearer token
- 启动子进程时注入 `WBFM_SERVER_MANAGED=1` 和 `WBFM_TOKEN`
- 所有 `/api/*` 请求校验 `x-wbfm-token` 头，不对就 401
- token 通过 preload 暴露给前端（`window.wbfm.token`），前端自动带上

```ts
// token-guard.ts
if (process.env.WBFM_SERVER_MANAGED !== '1') return; // Web 模式放行
const token = req.headers['x-wbfm-token'];
if (token !== process.env.WBFM_TOKEN) {
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
```

非托管模式（直接 `next dev`）不校验，方便开发。

## 威胁模型：我们防的是谁

这套设计不是防国家级攻击，是防：

- 本机其他进程偷读 Key 文件（加密 + 0600）
- 恶意网页跨进程调用本地服务（令牌守卫）
- XSS 窃取 Key（不返回明文）
- 日志泄露 Key（脱敏 + 不打印）

对于一个本地单用户应用，够用了。

## 小结

本地 AI 应用的密钥安全，三层防护：

1. **加密落盘**：桌面用 safeStorage，Web 用 AES-256-GCM
2. **永不返回明文**：出参统一脱敏，密文只在服务层内存解密
3. **本地服务鉴权**：随机端口 + bearer token，防本机其他进程调用

下一篇聊聊「SQLite + sqlite-vec 怎么做 100 篇文档内的私域知识库」。
