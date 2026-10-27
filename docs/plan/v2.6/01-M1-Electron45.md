# v2.6 M1：Electron 45 平台续航

> 状态：🟡 代码与 pack:dir 验收完成；NSIS / updater / 旧密文真机项待收口
>
> 分支：`feature/v2.6-conclusion-memory`｜契约：[M0](M0-契约冻结.md)

## 1. 变更

| 文件 | 变化 |
|---|---|
| `apps/desktop/package.json` | `electron` 44.9.3 → **45.0.0**；builder 26.18.0 / updater 6.8.11 不变 |
| `pnpm-lock.yaml` | 同步 Electron 45 解析 |
| `apps/desktop/src/main/cipher-server.ts` | 同步 `encryptString / decryptString` → 异步 `encryptStringAsync / decryptStringAsync`；HTTP handler 改为 async，错误统一 500 |
| `apps/desktop/src/main/index.ts` | `isEncryptionAvailable()` → `await isAsyncEncryptionAvailable()` |
| `apps/desktop/src/main/cipher-server.test.ts` | 新增 5 例：401、加密、解密、422、存储抛错 500 |
| `cipher-bootstrap.ts` / `server-manager.ts` | 注释从「同步桥」修正为「回环桥（Node 侧同步语义）」；实现未改 |
| preload | 审计确认未使用被移除的 `Buffer / events / timers / url`，无需代码改动 |

## 2. 验证结果

| 项 | 结果 |
|---|---|
| 桌面 typecheck | ✅ `tsc --noEmit` + e2e tsconfig |
| 桌面单测 | ✅ 26 文件 / **173 例** |
| 全仓 `pnpm check` | ✅ typecheck 14/14、lint 0 error、300 行门禁通过 |
| Electron 45 真实 safeStorage | ✅ `isAsyncEncryptionAvailable=true`；encrypt/decrypt round-trip `ok=true`，`shouldReEncrypt=false` |
| electron-builder pack:dir | ✅ 用本地 `electronDist` 完成 `release/win-unpacked` |
| 桌面 smoke | ✅ **11/11**（窗口、四模块导航、安全基线、控制通道、托管 token、桌宠、键鼠） |
| 依赖审计 | ✅ Electron 公告 **0**；全仓 critical **3**（与 v2.5 基线一致，均为开发链） |

## 3. 已知残余

1. 本机 electron-builder 直接下载 Electron 45 时连接 GitHub 超时；需用
   `--config.electronDist=<repo>/node_modules/electron/dist`。CI 网络正常时不需该参数。
2. 本里程碑只跑了 `pack:dir` + Playwright smoke；**NSIS 安装包、2.5.0 覆盖升级、自动更新链**尚未在真机执行。
3. 真实供应商密钥的**旧密文 round-trip**尚未用现有数据根验证；新密文 round-trip 已通过。
4. 未做 Electron 冷启动 / 空闲内存基线；按计划归入 M5 前的 P1-3。

## 4. 结论

Electron 45 的代码迁移与桌面核心链路已通过；M1 可继续收口安装包/更新链，不阻塞 M2 会议结论后端开工。
