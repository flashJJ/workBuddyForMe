# Electron 45 迁移实战：safeStorage 异步化与沙箱 preload

平台升级最容易骗过人的地方，是「类型检查过了、单测也过了」。桌面壳的破坏性变化往往不在编译期暴露，而是在打包后、带着真实密钥与真实数据启动时才发作。

这次把桌面壳迁到 Electron 45，遇到两个必须正面处理的破坏性变化：`safeStorage` 同步加解密 API 被弃用，以及沙箱 preload 移除了一批 Node 全局。后者听起来更吓人，实际反而是前者更危险。

这篇按「变化 → 影响面 → 迁移 → 验证 → 教训」拆开讲。

## 一、为什么把平台升级当成独立任务

平台升级与业务功能混在一起，出问题时很难判断是「新平台的行为变了」还是「新代码写错了」。我们采取的顺序是：

1. 先升级 Electron 与相关构建链，跑通打包目录；
2. 再做破坏性 API 迁移，逐处改调用；
3. 最后在打包产物上做冒烟与真机验证。

每一步都要求可回退。升级本身不改业务逻辑，迁移本身不改产品行为，这样任何一步失败都能快速定位。

## 二、破坏性变化一：safeStorage 不再同步

### 2.1 原有架构

密钥密文只能由桌面壳主进程的 `safeStorage` 解密。但业务跑在独立的内置 Node 服务进程里，拿不到 `safeStorage`。原来的方案是一个本地回环桥：

```text
内置 Node 服务（同步调用）
   → Worker 线程发 HTTP 请求
   → 主进程回环 HTTP 服务
   → safeStorage 加解密
```

Node 侧通过 `Atomics.wait` 保持**同步语义**，调用方不需要改造成 async。这个设计在旧平台上工作正常。

### 2.2 新平台的变化

Electron 45 把同步的 `encryptString / decryptString / isEncryptionAvailable` 标记为弃用，改用异步版本：

| 旧 API | 新 API | 返回 |
|---|---|---|
| `encryptString(text)` | `encryptStringAsync(text)` | Promise\<Buffer\> |
| `decryptString(buf)` | `decryptStringAsync(buf)` | Promise\<{ result, shouldReEncrypt }\> |
| `isEncryptionAvailable()` | `isAsyncEncryptionAvailable()` | Promise\<boolean\> |

注意解密返回的不再是字符串，而是一个对象。取明文要读 `.result`；`shouldReEncrypt` 表示系统密钥可能轮换，建议重新加密。

### 2.3 全链路 await

「全链路」不是只把最后一行改成 await，而是从 HTTP handler 到可用性检查都要改：

```text
可用性检查   isEncryptionAvailable()        → await isAsyncEncryptionAvailable()
加密 handler await safeStorage.encryptStringAsync(text)
                  → base64 返回
解密 handler await safeStorage.decryptStringAsync(buf)
                  → 返回 decrypted.result
HTTP handler 同步回调                       → async handler + 统一 catch → 500
```

回环桥的 HTTP handler 原本是同步函数，改成 async 后必须显式捕获异常：加解密抛错时返回 500，而不是让未处理的 Promise 拒绝把服务进程带崩。

Node 侧的同步门面没有改。这是关键取舍：**对外仍是同步语义，对内已经是异步实现。** 调用方不需要知道底下换了 API，但桥的实现必须真的 await，不能把 Promise 塞进同步返回值。

### 2.4 旧密文与重加密

迁移最怕的是「新版本读不了旧密钥」。验证结果是：旧版本写入的密文在新版本仍可正常解密。

`shouldReEncrypt` 我们只记录、不自动触发重加密。持久化层下次保存密钥时会重新加密，自然完成轮换。这样避免在启动路径上插入一次额外的写操作，也避免「解密即改写」带来的失败风险。

### 2.5 一个容易踩的坑：await 只加在一处

迁移时最常见的错误，是只在最外层加 `await`，桥内部仍按同步方式组织：

```text
错误：encryptHandler(text) { return encryptStringAsync(text) }  // 返回 Promise
     → 上层 await 了，但 base64 编码发生在 Promise 上
正确：async encryptHandler(text) {
        const buf = await encryptStringAsync(text);
        return buf.toString('base64');
      }
```

这类错误的可怕之处是它不会报类型错：返回 Promise 也是合法返回值，只有真正调用时才暴露成 `[object Promise]` 或空密文。我们的处理原则是，凡是调用新 API 的函数，签名一律改成 async，不允许「在外面 await、在里面同步返回」的混合写法。

同理，解密不能写 `await decryptStringAsync(buf)` 然后当字符串用，必须取 `.result`。类型检查能挡住大部分，但测试要覆盖「解出来的明文与原文一致」，而不只是「没有抛错」。

## 三、破坏性变化二：沙箱 preload 的全局被移除

新平台在沙箱 preload 中移除了 `Buffer / events / timers / url` 等 Node 全局。影响面取决于 preload 有没有依赖它们。

我们的审计结论是：preload 只使用 `contextBridge`、`ipcRenderer` 与 `process.argv`，没有使用被移除的全局，因此不需要改代码。但这个结论必须来自逐行审计，不能来自「应该没用」。

审计时遵循两条规则：

- preload 只做桥接，不做数据处理；需要 `Buffer` 的序列化逻辑放回主进程；
- 不给 preload 注入 polyfill。补一个假 `Buffer` 只会把问题推迟到运行时，而且沙箱里的假实现与真实 Buffer 行为未必一致。

```text
preload 允许：contextBridge / ipcRenderer / process.argv
preload 禁止：Buffer / events / timers / url / 其他 Node 内置模块
```

有一个容易混淆的边界：**沙箱限制只作用于 preload，不作用于 Node 子进程。** 负责回环桥的 bootstrap 仍运行在独立 Node 进程里，可以正常使用 `Buffer`、`SharedArrayBuffer` 与 `Atomics.wait`。迁移时不要因为「preload 不能用了」就把桥的同步实现也一起改掉，那会引入不必要的行为变化。

## 四、首次启动：重建密钥密度缓存

新平台首次启动会重新建立**密钥密度缓存**。这一步发生在桌面壳内部，业务侧无感，但升级验证时要确认它不会让旧密钥失效。

真机验证的做法是：用上一版本写入的真实供应商密钥，在新版本启动后直接读取供应商列表并完成一次对话。只验证新密文 round-trip 不够，那只证明「新写的新读」，没有证明「旧写的新的能读」。

## 五、迁移顺序与打包细节

最终执行的顺序：

| 阶段 | 动作 | 通过标准 |
|---|---|---|
| 1 | 升级 Electron 与构建链 | 打包目录可产出 |
| 2 | 迁移 cipher 桥与可用性检查 | 单测 + 真实 safeStorage round-trip |
| 3 | 审计 preload 全局 | 无被移除全局依赖 |
| 4 | 打包态冒烟 | 桌面 11/11 |
| 5 | 真机覆盖升级 | 旧密文可解密、数据保留 |

本地打包遇到过一个与环境有关的问题：直接下载新平台产物时网络超时。解决办法是指定本地已安装的 Electron 分发目录，跳过下载。这是构建环境的绕行，不是产品问题，CI 网络正常时不需要。

## 六、验证矩阵

| 项 | 结果 |
|---|---|
| 桌面类型检查 | 通过（含 e2e tsconfig） |
| 桌面单测 | 26 个测试文件、173 例 |
| cipher 端点测试 | 5 例：401 / 加密 / 解密 / 422 / 存储抛错 500 |
| 真实 safeStorage | 可用性为真，加解密 round-trip 通过，无需立即重加密 |
| 打包目录冒烟 | 11/11 |
| 真机旧密文 | 上一版本写入的密钥在新版本正常解密 |

`cipher` 端点测试覆盖 401、加密、解密、422 与 500，是因为这条链路的问题几乎都表现为「某一类请求没有得到正确的状态码」。把状态码测全，比只测 happy path 更能防回归。

## 七、四条教训

1. **同步门面不等于同步实现。** 对外保留同步语义是产品兼容，对内该 await 的地方必须 await；把 Promise 藏进同步返回只是把故障延后。
2. **升级前先审计全局。** 沙箱移除全局这类变化，代码不一定报错，但会在运行时缺函数。审计清单要具体到模块名，不能写「应该没用到」。
3. **旧数据的兼容要单独验证。** 新写新读通过，不代表旧写新读通过；真机上的旧密文才是升级路径的唯一证据。
4. **打包态才是发布态。** 开发态不经过回环桥、不经过沙箱 preload，也不带真实数据根。只有打包目录上的冒烟与真机覆盖升级，才能证明迁移完成。

平台迁移没有产生任何用户可见的新功能，但它决定了后面所有功能能不能安全落地。这类工作的价值，往往要在出问题的时候才被看见——所以更值得提前做扎实。
