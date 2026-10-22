# v2.5 方案：稳固底座——Next 15.5.28 安全升级与 Electron 44 平台换代

> 主题一句话：**先把地基换到仍有安全支持的主版本，再谈功能**——消除 Next 的两个 critical RCE，并把停在 Electron 31 / electron-builder 25 的桌面壳推进到 2026 年仍受支持的版本线。
>
> 编号 **v2.5**（上一正式版 v2.4.0）。本版是**安全与平台底座版**：零新功能、零数据模型变更，交付物是依赖升级、兼容性修复、打包链路验证与可重复的安全基线。
>
> 取证基准：`main` `1145fd3`（v2.4.0 封版后）；`pnpm audit --json` 于 2026-10-22 执行。完整证据、公告清单与逐步迁移清单见 [01-安全基线与升级矩阵](01-安全基线与升级矩阵.md)。

## 1. 版本主题与目标

**价值主张**：用户安装 2.5 后，不再因框架/桌面壳的已知 RCE 暴露；维护者能用一条可重复的命令确认安全基线，而不是每次靠一次性的扫描结果。

**成功指标（可验收）**：

| 指标 | 现状（2026-10-22） | 目标 |
|---|---|---|
| Next critical RCE | 2 条：`GHSA-p293-qw3h-jr36`、`GHSA-2xp9-vwfh-vxw4`（next 14.2.35） | **0 条**（next 15.5.28，修复阈值 ≥15.5.24） |
| Next 公告总数 | 23 条（critical 2 / high 8 / moderate 11 / low 2） | **0 条**（15.5.28 覆盖全部修复阈值） |
| Electron 公告 | 38 条（electron 31.7.7；最高修复阈值 42.11.3） | **0 条**（electron 44.9.3） |
| 构建链 critical | tar 6.2.1（electron-builder 25.1.8 传递） | **0 条**（electron-builder 26.18.0 → tar ^7.5.7，当前 7.5.22） |
| 全仓 critical | 6 条 | M1 后 **4 条**（Next 已清，tar 待 M2）；M2 后实测 **3 条**（剩余 gh-pages / tinypool×2，均非运行时；P1 评估清零） |
| 功能回归 | — | 8 包单测、e2e 109 例、桌面 smoke 全绿 |
| 打包与升级 | v2.4.0 standalone 可启动 | Next 15 standalone 仍可启动、不追踪用户数据；Windows 安装包可安装、可从 2.4.0 覆盖升级 |
| 安全基线 | 一次性 audit | 固化为可重复门禁（命令 + 基线表 + 残余风险清单） |

## 2. 现状与痛点

### 2.1 两个 critical RCE 都落在 Next 上，而产品是 Windows 桌面应用

- [apps/web/package.json](../../../apps/web/package.json) 当前 `next: ^14.2.15`，锁文件解析为 **14.2.35**；
- 两条 critical 均为框架级漏洞，修复版本都是 **≥15.5.24**：
  - `GHSA-p293-qw3h-jr36`：**Windows 托管服务上的未认证 RCE**，影响 `>=13.4.0 <15.5.24`；
  - `GHSA-2xp9-vwfh-vxw4`：**Image Optimization API 在使用 AVIF 时的未认证 RCE**，影响 `>=10.0.0 <15.5.24`。
- 本产品在 Windows 上由 Electron 托管 Next standalone（[server-manager.ts](../../../apps/desktop/src/main/server-manager.ts)），服务虽只绑定 `127.0.0.1`，但 WBFM token 只覆盖 `/api/*`，Next 内部路径（如 `/_next/image`）不经过 token 守卫。**回环绑定降低远程面，不等于不可达**（本机恶意进程/页面仍可访问）。
- 当前代码未使用 `next/image`（全仓 grep 无匹配），但版本仍完整落在公告区间；本版以**升级**收口，而不是逐条论证「不可利用」。

### 2.2 Next 14 的 23 条公告与 15.5.28 的选择

- 当前 next 14.2.35 共命中 **23 条** Next 公告：2 critical、8 high、11 moderate、2 low，最高修复阈值 15.5.24；
- npm `dist-tags`：`latest=16.4.2`、`backport=15.5.28`。**15.5.28 是 15.5 线最新安全回补**，满足「15.5.24+」，且比 Next 16 的破坏面小；
- Next 15 的 App Router 要求 React 19（官方升级指南），当前 React 18.3.1 必须同步升级到 **19.3.1**（类型 19.3.0）。

### 2.3 Electron 31.7.7 已远离支持窗口

- [apps/desktop/package.json](../../../apps/desktop/package.json) 当前 `electron: 31.7.7`，命中 **38 条** Electron 公告，覆盖 UAF、沙箱/上下文隔离绕过、自定义协议跨域读取、渲染器命令注入等，最高修复阈值 **42.11.3**；
- `electron` 在 package.json 中是 devDependency，但**它的二进制会随安装包分发给最终用户**，审计的 dev 标签不降低运行时风险；
- Electron 只支持最新 3 个稳定 major（当前为 43/44/45）。31 早已出窗，必须换代。

### 2.4 electron-builder 25 / electron-updater 6.8.9 的构建链风险

- `electron-builder: ^25.1.8` 解析为 **25.1.8**，传递依赖命中的关键项：
  - `app-builder-lib <26.15.0`：`GHSA-7g7r-gx96-252g`（AppImage 搜索路径）；
  - `builder-util-runtime 9.2.10`：`GHSA-p2f4-r6v6-j797`（跨源重定向泄露凭据）；
  - `tar 6.2.1`：`GHSA-23hp-3jrh-7fpw`（critical，解压/解析 DoS）及其余 8 条 high、3 条 moderate。
- `electron-updater: ^6.8.9` 当前锁文件已把 `builder-util-runtime` 解析到 9.7.0（已修复），但仍建议升 **6.8.11**（v26 通道最新，2026-10-20）与 electron-builder 26 对齐。
- `electron-builder 26.18.0` 依赖 `app-builder-lib 26.18.0`、`builder-util-runtime 9.7.0`、`tar ^7.5.7`（当前 7.5.22），上表三项全部消除。

### 2.5 升级面已走查：不是「改个版本号」

- **Next 配置**：[next.config.mjs](../../../apps/web/next.config.mjs) 仍使用 `experimental.serverComponentsExternalPackages`（15 已改名）与 `experimental.outputFileTracingIgnores`（**15.5.28 的类型里已没有这个键**，只剩 `outputFileTracingRoot/Excludes/Includes`）。后者关系到 standalone 是否会追踪到 `~/.workbuddy-for-me` 用户数据，是本版最高打包风险；
- **异步请求 API**：4 个服务端页面同步读取 `searchParams`（assistants / flows / knowledge / settings），Next 15 生成类型要求 `Promise`；
- **Electron 44 剪贴板**：`clipboard.writeText()` 在 44 变为异步，而中文输入走「写剪贴板 → Ctrl+V」，当前 [input.ts](../../../apps/desktop/src/main/computer/input.ts) 未 await，存在粘贴早于写入的竞态；
- **原生模块**：`@nut-tree-fork/nut-js 4.2.6` 的 `libnut` 是 N-API（node-addon-api 7.1.0），不需要按 Electron ABI 重编译，但必须真机验证；
- **向前看**：Electron 45 已把同步 `safeStorage` 标记弃用、移除沙箱 preload 的 `Buffer/events/timers/url` 全局。本版选 44 可避开这两个立即迁移项，但要在 v2.6 前处理（见 P1-4）。

## 3. 功能清单

> 本版没有用户功能；按「技术项」列 P0/P1/P2，每条仍给可验收标准。

### P0 必做

**P0-1 Next 15.5.28 + React 19（本版首要技术项）**

- 用户故事：作为用户，我安装 2.5 后不再暴露于 Next 的两个已知 critical RCE；作为维护者，`pnpm audit` 不再出现任何 Next 公告。
- 验收：
  1. `apps/web/package.json`：`next`、`eslint-config-next` 升到 **15.5.28**；`react`/`react-dom` 升到 **19.3.1**，`@types/react`/`@types/react-dom` 升到 **19.3.0**；
  2. `pnpm audit --json` 中 `next` 模块公告数为 **0**，两条 critical RCE 消失；
  3. 4 个同步 `searchParams` 页面改为 `Promise` + `await`，`pnpm typecheck` 通过；
  4. Next 配置完成 `serverExternalPackages` 与 `outputFileTracingExcludes` 迁移，standalone 产物中 **0 条** `.workbuddy-for-me` / `C:/Users/...` 嵌套条目；
  5. `pnpm check`、8 包单测、e2e 109 例全绿；打包态应用能启动并完成首问、流式对话、语音、桌宠、知识库检索。
- 技术要点：依赖矩阵、异步请求 API、React 19 类型/水合、fetch 与 GET 路由缓存默认值变化、standalone trace 断言、`next lint` 继续留在 15 口径（不迁 ESLint 9）。
- 规模：L（跨 web 包 + 构建/打包链路）。

**P0-2 Electron 44.9.3 + electron-builder 26.18.0 + electron-updater 6.8.11**

- 用户故事：安装 2.5 的桌面壳不再带着 31 时代的已知沙箱/UAF 问题；安装器与自动更新链路继续可用。
- 验收：
  1. 三个版本按目标矩阵锁定；`pnpm audit` 中 `electron` 公告数为 **0**，`app-builder-lib` / `builder-util-runtime` / `tar` 的 critical/high 消失；
  2. 中文输入走剪贴板粘贴时先 `await` 写入再 `Ctrl+V`，真机连续输入 20 段中文无丢字；
  3. 桌面 smoke：主窗、桌宠（透明/穿透/拖拽）、舞台、桌面控制（截图/键鼠/UIA）、系统通知、全局快捷键、自动更新检查全部通过；
  4. `pnpm dist:win` 产出 NSIS 安装包；在干净 Windows 环境安装、从 2.4.0 覆盖升级、卸载保留/删除数据两态均通过；
  5. `app-update.yml` / `latest.yml` 生成正确，draft Release 转 Latest 后 2.4.0 能检测到 2.5.0。
- 技术要点：Electron 44 剪贴板异步化、N-API 原生模块加载、electron-builder 26 的 NSIS/签名双态/asarUnpack、electron-updater 6.8.11 的 GitHub feed。
- 规模：L（桌面壳 + 安装器 + 更新链路）。

### P1 争取

- **P1-1 可重复安全基线门禁**：新增 `scripts/audit-baseline.mjs`（或等价脚本），跑 `pnpm audit --json` 并与本文基线表比对；新增 critical/high 运行时公告即失败，允许清单只接受已登记的 dev/build 残余项。封版命令固定为 `pnpm security:audit`。
- **P1-2 残余 critical 清零**：`gh-pages`（pixi-live2d-display 传递）用 `pnpm.overrides` 钉到 ≥5.0.0；`tinypool` ×2 评估升级 vitest（5.x）或 override 到 ≥2.1.2，先跑全量单测确认兼容。两项均非运行时，失败可回退并登记。
- **P1-3 `/_next/image` 防御性收口**：既然全仓未使用 `next/image`，在托管模式下显式拒绝 `/_next/image` 请求（middleware 或最小路由守卫），把「框架内部端点」也纳入显式白名单；需回归静态资源与 VRM/背景图路由不受影响。
- **P1-4 Electron 版本跟进机制**：固定「只跟最新 3 个 supported major」的季度评审；记录 Electron 45 的两个前瞻项（`safeStorage` 异步化、沙箱 preload 全局移除），在 v2.6 前完成迁移预研。

### P2 留白

- **P2-1 Next 16 迁移 spike**：16.4.2 已是最新，但破坏面（缓存/请求 API/构建）另立版本评估，不与安全升级混做。
- **P2-2 开发链大版本**：ESLint 9、Tailwind 4、Vitest 5、Node 运行时统一升级。
- **P2-3 全量 dev 依赖 high 清零**：postcss/braces/follow-redirects/source-map-js/vite 等，按实际可达性排期。

## 4. 架构影响

| 层 | 变化 |
|---|---|
| web | `next`/`eslint-config-next`/React 三件套与类型升级；`next.config.mjs` 两个配置键迁移；4 个页面 `searchParams` 改异步；Route Handler context 类型收口；可能少量 React 19 类型修复 |
| desktop | `electron`/`electron-builder`/`electron-updater` 升级；`clipboard.writeText` 调用改为 await；安装器与更新链路回归 |
| shared / core / database | **无代码与数据模型变更**；仅需确认打包产物在 Next 15 standalone 下仍可加载 |
| 打包 | Next standalone trace 排除迁移与断言；`prepare-server.mjs` 兜底归集清单复核；NSIS 安装器/覆盖升级验证 |
| CI / 发布 | 新增安全基线命令；release workflow 用 Electron 44 出包；产物大小与 SHA256 归档 |
| 备份 / 迁移 | **无 schema 变更、无备份版本升级**（本版不改任何表） |
| i18n | 无新增文案；错误码与现有 zh/en 字典不变 |

## 5. 里程碑拆分

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 方案与基线冻结 | 本文 + [01 安全基线与升级矩阵](01-安全基线与升级矩阵.md)；锁定目标版本、残余风险与 Non-Goals | 方案评审通过；分支 `feature/v2.5-platform-upgrade` 建立 |
| M1 Next 15.5.28 + React 19 | 依赖升级、配置迁移、4 页 `searchParams`、React 19 类型修复、standalone trace 断言 | Next 公告 0；打包态能启动；`pnpm check` + 单测绿 |
| M2 Electron 44.9.3 + builder 26.18.0 | 桌面依赖升级、剪贴板 await、原生模块/桌宠/舞台/控制 smoke、安装器构建 | Electron 公告 0；NSIS 出包；剪贴板中文输入通过 |
| M3 封版门禁 | 全量 `pnpm check`、8 包单测、e2e 109、eval 不受影响确认、安装/覆盖升级、2.4.0 自动更新检查 | 全部门禁绿；残余风险清单定稿 |
| M4 发布归档 | `pnpm sync-version` → `--no-ff` 合 main → tag `v2.5.0` → Release 置 Latest → 安装包归档 | Release 转正；产物与 SHA256 归档 |

## 6. 风险与取舍

- **15.5.28 vs 16.4.2**：选 15.5.28。15.5 是仍在回补的安全线，满足 15.5.24+；Next 16 的破坏面另立版本，避免「安全升级 + 大版本迁移」同时爆。
- **React 19 生态兼容**：只做必要升级（React 三件套 + 类型），库侧仅在有 peer 冲突或运行期错误时升 Radix / TanStack Query / xyflow；不借机批量升依赖。水合问题沿用现有 `data-hydrated` 门控与 e2e 回归。
- **`outputFileTracingIgnores` 在 15 被移除（最高风险，M1 已实证并解决）**：Next 15 的 `outputFileTracingExcludes` 路由级过滤在 Windows 会被 `path.join` 转成反斜杠、picomatch 不命中，实测仍会把 `C:\Users\...\.workbuddy-for-me` 写进 trace。改为 [apps/web/scripts/build.mjs](../../../apps/web/scripts/build.mjs) 构建期把 `HOME/USERPROFILE` 指向临时空目录，并在构建后扫描 `.nft.json` 与 standalone，出现用户数据/盘符路径即构建失败；`outputFileTracingExcludes` 仅保留为非 Windows 兜底。同时显式设置 `outputFileTracingRoot` 为仓库根，避免 Next 15 因上级目录里的另一个 lockfile 把 tracing root 推到仓库外。
- **Electron 44.9.3 vs 45.0.0**：选 44.9.3。45.0.0 于 2026-10-21 刚发布，且带来 `safeStorage` 同步弃用/沙箱 preload 全局移除；44 在支持窗口内且补丁成熟。45 列入 P1-4 的前瞻清单。
- **electron-builder 26.18.0 的 `latest` 标签滞后**：npm `latest` 仍指 26.15.3，26.18.0 走 `v26` 通道（2026-10-20）。本版钉 26.18.0；若 NSIS/签名回归，回退 26.15.3（仍 ≥26.15.0 修复线）。
- **electron-updater 6.8.11 的 feed 行为**：重点验证 draft → Latest、`app-update.yml` 生成、2.4.0 → 2.5.0 升级；失败则回退 6.8.9（其 `builder-util-runtime` 已是 9.7.0）。
- **残余 critical 是 dev/build 链**：gh-pages 只用于文档发布，tinypool 只在测试进程；本版接受登记，P1 有余量再清，不阻塞封版。
- **300 行硬门禁**：升级带来的类型/配置修正若把文件推过 300 行，按既有规则抽函数/模块，不登记白名单。

## 7. Non-Goals（本版明确不做）

- **不升 Next 16**：本次只到 15.5.28 安全线；Next 16 单独立项。
- **不升 Electron 45**：45.0.0 刚发布，不纳入本版；只记录前瞻项。
- **不做功能开发 / UI 改版 / 数据模型变更**：本版零新功能、零迁移、零备份 schema 变更。
- **不迁 ESLint 9 / Tailwind 4 / Vitest 5 / Node 运行时**：维持现有工具链，避免安全升级被工具链迁移拖慢。
- **不做 macOS/Linux/32 位构建**：产品仍是 Windows x64；Electron 44 移除 32 位与 macOS 12 支持不影响本产品。
- **不追求全仓 audit 清零**：只对运行时 critical/high 与两条 critical RCE 设硬门槛，dev/build 残余项登记跟踪。

---

## 8. M1 实施记录（2026-10-22，已完成）

| 项 | 实测结果 |
|---|---|
| 依赖 | next **15.5.28**、react/react-dom **19.3.1**、@types/react(-dom) **19.3.0**、eslint-config-next **15.5.28** |
| Next 公告 | **23 → 0**；`GHSA-p293-qw3h-jr36`、`GHSA-2xp9-vwfh-vxw4` 均消失 |
| 全仓 critical | **6 → 4**（gh-pages / tar / tinypool×2；tar 待 M2 消除） |
| 门禁 | `pnpm check` 通过（typecheck 14/14、lint 0 error、行数门禁）；web 单测 **104 文件 / 555 例**全绿 |
| 构建 | `pnpm build:web` 成功；standalone trace 门禁通过（0 用户数据/盘外路径）；`server.js` `/api/health` 返回 200 |

**关键改动**：

- `apps/web/package.json`：Next/React 三件套与类型升级；build 改为 `node scripts/build.mjs`。
- `apps/web/next.config.mjs`：`serverComponentsExternalPackages` → 顶层 `serverExternalPackages`；`outputFileTracingIgnores` → `outputFileTracingExcludes`（非 Windows 兜底）；显式 `outputFileTracingRoot=repoRoot`；`outputFileTracingIncludes` 移出 experimental。
- 4 个列表/设置页 + `flows/[id]`：`searchParams`/`params` 改 `Promise` + `await`；`defineRoute`/`definePublicRoute` 改为重载签名（兼容 Next 15 必填 `{ params: Promise<P> }` 与单测只传 request）。
- 新增 `apps/web/scripts/build.mjs`：构建期隔离家目录 + 构建后 trace/standalone 硬门禁。
- React 19 适配：`RefObject<T | null>`；客户端测试改用 feature 组件（不再直接渲染 async Server Component）。
- 顺带修复 React 19 暴露的真实缺陷：Ollama 面板在 `setProvider` 同帧内用旧闭包 `providerId=null` 拉模型，且把 `null` 当数组写入 state；已改为显式传 `providerId` 并归一化为 `[]`。

**与方案的偏差**：`outputFileTracingExcludes` 在 Windows 路由级不生效，采用「构建期家目录隔离 + 构建后断言」替代；`outputFileTracingRoot` 是方案外新增项（Next 15 的 lockfile 探测会把 root 推到 `E:\code\traeWork`）。

## 9. M2 实施记录（2026-10-22，已完成）

| 项 | 实测结果 |
|---|---|
| 依赖 | electron **44.9.3**、electron-builder **26.18.0**、electron-updater **6.8.11**；`@nut-tree-fork/nut-js` 保持 **4.2.6** |
| Electron 公告 | **38 → 0**；`electron` 不再出现在 audit 结果 |
| 构建链 | `tar`、`app-builder-lib`、`builder-util-runtime` 公告 **全部消失**；全仓 critical **6 → 3**（gh-pages / tinypool×2） |
| 全仓计数 | high **40 → 8**、moderate **48 → 12**、low **9 → 2**；依赖总数 **1373 → 1343**（生产 555 / 开发 718 / 可选 199） |
| 剪贴板 | `ClipboardSetter` 改为异步；`await setClipboard(text)` 后才按 `Ctrl+V`；新增「写入未完成不按键」单测 |
| 门禁 | `pnpm check` 通过（typecheck 14/14、lint 0 error、行数门禁）；`pnpm test` 8 包全绿（web 104 文件/555 例、desktop 24 文件/165 例） |
| 安装包 | `WorkBuddyForMe-Setup-2.4.0.exe` **198,257,702 B**；`latest.yml` sha512/size 正确；`app-update.yml`（GitHub / draft）正确；electron-updater 位于 app.asar |
| 覆盖升级 | 已装机 2.2.0 → 静默安装 2.4.0 成功：文件/产品版本 **2.4.0**，卸载项显示 **WorkBuddyForMe 2.4.0** |
| 安装版 smoke | 主窗存活（标题 WorkBuddyForMe）、托管服务 `/api/health` 无 token **401**（守卫生效）、主进程日志 `托管服务就绪`（带 token 健康检查通过）、`控制通道就绪`（libnut 原生模块加载）；自动更新检查可达 GitHub |

**关键改动**：

- `apps/desktop/package.json`：electron 钉 **44.9.3**、electron-builder **^26.18.0**、electron-updater **^6.8.11**。
- `apps/desktop/src/main/computer/input.ts` / `control-bootstrap.ts`：剪贴板写入异步化并串行化到 `Ctrl+V` 之前。
- `apps/desktop/src/main/index.ts`：Electron 44 已移除 `ClearStorageDataOptions.quotas`，删除该字段（其余 storages 清单不变）。
- `apps/desktop/electron-builder.yml`：新增 `resources/server/node_modules → server/node_modules` 的显式 extraResources 映射。
- `pnpm-workspace.yaml`：`allowBuilds` 登记 `electron-winstaller: false`（只出 NSIS，不需要其 Squirrel postinstall）。
- `apps/desktop/src/main/cipher-bootstrap.test.ts`：fork 炸弹回归用例显式 20s 超时（子进程固有 4s 存活 + 并行负载，5s 默认值会偶发超时）。

**发现并修复的打包阻断**：electron-builder 26 对 extraResources 的**根级 `node_modules`** 有硬编码过滤（`app-builder-lib/out/util/filter.js` 中 `relative === "node_modules"` 直接返回 false）。首版安装包因此缺少 `next` 等 standalone 运行时依赖，安装版启动即 `Cannot find module 'next'`；`win-unpacked` 目录运行同样受影响（此前 smoke 未覆盖安装态）。补一条独立映射后，`resources/server/node_modules` 41 个条目（含 next / better-sqlite3 / sqlite-vec-windows-x64）正常进入安装包，安装版启动通过。

**与方案的偏差**：第二次重建时 electron-builder 从 GitHub 重新下载 Electron 卡在 0 字节（网络侧停滞），改用 `--config.electronDist=<repo>/node_modules/electron/dist` 复用已安装的 44.9.3 dist 完成出包；产物内容一致，`dist:win` 脚本本身未改。安装包版本仍为 **2.4.0**（版本号在 M4 统一 bump 到 2.5.0）。

**未在 M2 完成的验证**：真机「中文粘贴 20 段不丢字」未执行。尝试通过控制通道驱动 Notepad 时，`SetForegroundWindow` 被 Windows 前台锁拒绝（控制通道返回 500），为避免误输入到其他窗口，测试在按键前中止；异步顺序已由单测覆盖，libnut 加载已由「控制通道就绪」验证，真机粘贴并入 M3 手测/端到端回归。

## 10. M3 封版门禁（2026-10-22，已完成）

| 门禁 | 结果 |
|---|---|
| `pnpm check` | **通过**（typecheck 14/14、lint 0 error、行数门禁） |
| 8 包单测 | **全绿**（web 104 文件/555 例、desktop 24 文件/165 例，其余包无失败） |
| Web e2e（生产模式） | **109/109 通过**（10.7 min；`GITHUB_ACTIONS=true` → `next start` + 独立临时数据根） |
| 桌面打包 e2e | **11/11 通过**（22.4s；窗口/安全基线/令牌/控制通道/键鼠/记事本/桌宠 4 例） |
| `eval:agent` 正向 | **15/15 通过** |
| `eval:agent` 反向矩阵 | reviewer **6/6**、knowledge **9/9**、budget **3/3** 通过 |
| 安装 / 覆盖升级 | M2 已完成（2.2.0 → 2.4.0 静默安装 + 安装态启动 smoke） |
| `sync-version:check` | 通过（2.4.0） |

**首轮 e2e 的环境性失败**：本地默认 `next dev` 跑满 109 例时，Web server 在约 24 分钟后堆内存耗尽（`JavaScript heap out of memory`），导致 88 通过、6 失败、15 未运行；失败的 meeting / tuning / voice / VRM 用例在按文件复跑或生产模式下均通过。**封版口径固定为生产模式**：先 `pnpm build:web`，再以 `GITHUB_ACTIONS=true` 运行 `pnpm test:e2e`（与 CI 的 `next start` 路径一致）。

**M3 门禁修复（测试/评估债，非运行时回归）**：

- [apps/desktop/e2e/smoke.spec.ts](../../../apps/desktop/e2e/smoke.spec.ts)：全新数据根会异步弹「首次使用向导」，遮罩拦截侧栏点击——改为等待并点击「跳过」；`about-version` 由硬编码 `v1.1.0` 改为读 `app.getVersion()`（M4 bump 无需再改）；回对话页的链接改用 `exact: true`（避免严格模式同时命中设置页「对话互动」）。
- [apps/desktop/e2e/pet-window.spec.ts](../../../apps/desktop/e2e/pet-window.spec.ts)：舞台 testid 已从 `pet-stage` 迁移为 `live2d-stage`；窗口 `show()` 在 `ready-to-show` 后异步执行，可见性/置顶/固定尺寸改为 `expect.poll`，消除创建瞬间的偶发失败。
- [scripts/eval/eval-agent.mjs](../../../scripts/eval/eval-agent.mjs)：助手知识库字段早已是 `knowledgeBaseIds: string[]`，脚本仍发单数 `knowledgeBaseId`，导致 `knowledge_search` 校验失败；已改为数组（正向与 knowledge 反向）。

**M3 未执行项**：

- `eval:memory`：需要真实对话/嵌入模型（Ollama 或云端供应商）且会写记忆库；当前环境仅有 `WBFM_MOCK_AI=1`，记忆提取在 mock 下无有效 JSON，故不纳入本机门禁，留发布前真机确认。
- 2.4.0 → 2.5.0 自动更新检查：需要先完成 M4 的版本 bump、tag 与 GitHub Release（draft → Latest），M4 发布后验证。

## 11. M4 版本 bump 与 2.5.0 发布（2026-10-22，已完成）

| 项 | 结果 |
|---|---|
| 版本同步 | root / web / desktop / `APP_VERSION` 全部 **2.5.0**；`sync-version:check` 通过 |
| 本地门禁 | `pnpm check` 通过；8 包单测（串行覆盖门禁）全绿；Web e2e **109/109**；桌面 e2e **11/11**；集成测试 **12/12**；eval-agent 正向 15/15 + 反向矩阵全绿 |
| Git | 提交 `2344de1`、`--no-ff` 合并 `b432748`、tag **v2.5.0**；main / feature 分支 / tag 均已推送 |
| GitHub Actions | CI（`39779643799`）**success**；Release（`39779682009`）**success** |
| Release | [v2.5.0](https://github.com/flashJJ/workBuddyForMe/releases/tag/v2.5.0) 已转正式并置为 **Latest** |
| 发布资产 | `WorkBuddyForMe-Setup-2.5.0.exe` **199,146,832 B**，sha256 `167559c8fd9ca5c14917380cd865ca2d4568c3f60ad4e21b7e70bb24dace8ddc`；`latest.yml` 357 B，sha256 `a0e450f93a3c7227ba0c1c00f4818c3948d6f8636543282900a84d34de52ba3e` |
| 自动更新验证 | 临时安装 2.4.0 启动后，更新器检测到 **2.5.0** 并开始下载；因本版未发布 blockmap，日志出现 `Cannot download differentially, fallback to full download` 后回退整包下载（缓存 198 MB 已清理）；随后恢复安装 2.5.0 |
| 本地归档 | 未生成：`gh release download` 拉取 199 MB 资产时网络停滞；**GitHub Release 即权威归档**，SHA256 使用资产 digest |

**发布说明中的已知限制**：本 tag 未附带 `.blockmap`（electron-builder 上传日志显示已尝试，但 Release 资产未出现），差量更新回退整包；`eval:memory` 与真机中文连续粘贴仍留发布后真机确认。

## 附：交付状态

- 状态：**✅ v2.5.0 已正式发布（2026-10-22，tag `v2.5.0`，Release 已转正并置为 Latest）**。
- 分支：`feature/v2.5-platform-upgrade`（已合并并推送）；`main` `b432748`。
- 基线取证：[01-安全基线与升级矩阵](01-安全基线与升级矩阵.md)（2026-10-22，`pnpm audit --json`）。
- 路线图登记：[docs/roadmap/README.md](../../roadmap/README.md)。
