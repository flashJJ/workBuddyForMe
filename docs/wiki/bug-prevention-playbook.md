# 缺陷预防手册（Bug Prevention Playbook）

> 来源：B-01 ~ B-62 复盘。目标不是“再修一次”，而是让同一类缺陷在**写代码时**就能被识别，在**门禁里**能被拦住。
> 每条模式固定四段：症状 → 代码信号 → 快速扫描 → 修复与回归范式。

## 0. 使用方式

1. **改动前**：按下表找到你正在触达的模式，逐条自查“代码信号”。
2. **改动后**：执行该模式的“快速扫描”，确认没有把同类问题带进来。
3. **提交前**：`pnpm check` + 对应定向测试；新缺陷归档到 `bug-registry.md` 时标注模式编号。
4. **每月一次**：用第 7 节的巡检清单做全仓扫描，产出的新问题按 B-xx 登记。

| 编号 | 模式 | 典型历史缺陷 |
|---|---|---|
| P1 | 配置上限多源 → 静默截断 | B-61、B-62 |
| P2 | 子进程/句柄未回收 | B-01、B-08、B-29、B-30 |
| P3 | 取消、超时与竞态 | B-07、B-10、B-12、B-13、B-14、B-50 |
| P4 | 单例与模块级状态漂移 | B-49 |
| P5 | 测试隔离与幂等 | B-03、B-04、B-47、B-48 |
| P6 | 网络、编码与端口边界 | B-11、B-13、B-54 |
| P7 | 沙箱与打包边界 | B-53、B-57、B-59 |
| P8 | 静默异常与后台任务 | B-14、B-52 |

---

## P1 配置上限多源 → 静默截断

**症状**：用户勾选/填写的第 N+1 项保存后消失；或保存成功但运行/调用时才报校验错误。

**代码信号**
- 同一上限同时出现在：zod schema `.max(N)`、前端提交体 `uniqueStrings(..., N, ...)` / `slice(0, N)`、UI 复选框/添加按钮。
- 三处数值不一致，或 UI 根本没有上限。
- 多选项追加顺序固定（如内置在前、MCP 在后），超限时总是丢掉最后追加的那组。

**快速扫描**
- 共享层：`packages/shared/src/schemas` 搜 `\.array\([^)]*\)\.max\(`，筛出用户可多选字段。
- 前端：`apps/web/src/features` 搜 `uniqueStrings\(|slice\(0,|Math\.min\(`，对照 schema 上限。
- UI：多选组件搜 `disabled=`、`atLimit`，确认达到上限时是否阻断并提示。

**修复与回归范式**
1. 上限提为共享常量（放在 `@wbfm/shared/constants`），schema、提交体、UI 全部引用同一常量。
2. UI 达到上限时禁用未选项，并展示“最多 N 个”的提示，不允许走到截断分支。
3. 提交体保留去重/截断作为服务端契约兜底。
4. 测试三件套：schema 边界（N 合法 / N+1 拒绝）、提交体截断、UI 达上限禁用。
5. 门禁：`packages/config/src/repo-invariants.test.ts` 的「用户可选上限单一来源」用例。

---

## P2 子进程 / 句柄未回收

**症状**：CI 步骤日志已打印通过但一直挂到超时；失败后端口被占；Electron 退出后仍有 node 进程。

**代码信号**
- `spawn(` / `exec(` 启动长驻进程，但未 `detached: true`。
- 失败路径只 `throw`，没有 `kill` 子进程/进程组。
- 脚本打印结果后没有显式 `process.exit`（Windows 上孙进程会占住管道）。
- 只 SIGTERM shell，没有对进程组 `SIGKILL`。

**快速扫描**
- `scripts/**/*.mjs`、`apps/desktop/src/main/**` 搜 `spawn\(|exec\(|detached|process\.exit|SIGTERM`。
- Playwright/验收/评测包装器逐个确认：成功、失败、超时三条路径都回收。

**修复与回归范式**
1. POSIX 下 `detached: true` 建进程组；退出时对整组 `SIGTERM`，超时再 `SIGKILL`。
2. 所有路径（含 catch/finally）调用统一 `stopChild`。
3. 脚本结尾显式 `process.exit(code)`。
4. 回归：本地跑一次，确认退出码正确且端口无残留监听。

---

## P3 取消、超时与竞态

**症状**：上游僵死 UI 永久转圈；切页面后麦克风常亮；停止后立刻再发，旧流把新流状态置回；展开已结束任务仍每 3 秒重连。

**代码信号**
- `new EventSource(` 只监听 message，没有在 `run_finished/error` 或组件卸载时 `close()`。
- 单次 `fetch` 没有 `AbortSignal.timeout`；看门狗对已锁定的 `response.body` 调 `cancel()`。
- 异步回调没有“代际 token / controller 身份”校验，卸载或切换后仍 `setState`。
- `setInterval` / `addEventListener` 没有对称清理。

**快速扫描**
- `apps/web/src`、`packages/core/src` 搜 `new EventSource\(|setInterval\(|addEventListener\(|AbortController|\.cancel\(\)`。
- 每个 `await` 之后检查：组件是否可能已卸载、请求是否可能已被新请求替代。

**修复与回归范式**
1. 流/连接在终止事件、`onerror`、卸载三处都关闭。
2. 超时用内部 `AbortController` + `AbortSignal.any`，不要对已锁定 body 调 cancel。
3. 启动代际 token：取消/卸载即作废，回调先校验身份再写状态。
4. 回归：真实 SSE/事件流测试 + 竞态用例（旧请求晚于新请求完成）。

---

## P4 单例与模块级状态漂移

**症状**：开发模式正常、生产打包后偶发读到旧库/旧配置；容器重建后旧 SQLite 连接不释放。

**代码信号**
- 模块级 `let x = ...`、`new X()` 缓存实例，Next 多 chunk 打包后每个 chunk 各有一份。
- `globalThis` 单例与模块级单例混用。
- 测试 reset 只关容器 DB，没有停定时器/丢弃语音运行时常驻单例。

**快速扫描**
- `apps/web/src/lib/server`、`packages/core/src` 搜 `globalThis\.|^let [a-zA-Z_]+ =|new .*Container|singleton`。
- 检查所有常驻资源（定时器、队列、DB、语音运行时）在 reset/重建时的释放路径。

**修复与回归范式**
1. 生产环境单例只保留 `globalThis` 一份；模块级只做类型/常量。
2. 提供显式 `reset()`：停调度器 → 丢弃常驻运行时 → 关 DB → 清数据根。
3. 回归：连续两次 reset 均 200，数据根可删除，旧路由不命中已关闭连接。

---

## P5 测试隔离与幂等

**症状**：单跑通过、全量失败；失败后重试必失败；用例顺序一换就红。

**代码信号**
- 新 spec 没有 `beforeAll` 调 `POST /api/testing/reset` 或统一封装。
- `beforeAll` 创建固定名称的供应商/助手，未在创建前按名称清理。
- 用例依赖前一个用例写入的全局设置（`avatarModelId`、`enabled` 开关）。
- 多个 spec 共用同一数据根且没有 `seed.ts` 自播种。

**快速扫描**
- `tests/e2e/**/*.spec.ts` 搜 `beforeAll|testing/reset|seed`。
- 按文件名清单对照：没有 reset/seed 的 spec 全部列出。
- 搜固定名称 fixture（如 `name: 'XXX'`）确认创建前有清理。

**修复与回归范式**
1. 每个 spec `beforeAll` 重置数据根，需要的数据由 `seed.ts` 自行播种。
2. 固定名称资源创建前先删，`afterAll` 再清一次。
3. 回归：单跑、全量跑、失败重试三种方式都通过。

---

## P6 网络、编码与端口边界

**症状**：中文站点乱码；健康检查卡 5 分钟；CI 偶发 `EADDRINUSE`。

**代码信号**
- `response.text()` 固定 UTF-8，未读 `content-type` / `<meta charset>`。
- 单次 `fetch` 没有超时，外层 deadline 形同虚设。
- 测试/脚本固定端口落在 `32768–60999`（Linux ephemeral 段）。

**快速扫描**
- 抓取类代码搜 `\.text\(\)|TextDecoder|charset`。
- 所有 `fetch(` 检查是否有超时/取消。
- `tests/**`、`scripts/**`、Playwright 配置搜 `port\s*[:=]\s*\d{4,5}`，筛出 `>=32768`。

**修复与回归范式**
1. 按 `content-type` 或 `<meta charset>` 解码，`gb2312` 归一到 `gbk`。
2. 每轮 fetch 用 `AbortSignal.timeout(min(5s, 剩余预算))`。
3. 测试端口统一使用 `32xxx` 段，并在 `development.md` 固化。
4. 回归：GBK 页面抓取用例、僵死服务健康检查用例、端口占用后重跑。

---

## P7 沙箱与打包边界

**症状**：安装版打开设置页加载失败；夜间在干净检出上构建失败；打包后主进程报模块找不到。

**代码信号**
- preload 里 `require` 了 `electron` 之外的包（sandbox 下只允许 electron 与少量内置模块）。
- 工作区包子路径 exports 指向 gitignore 的 `dist/`，构建脚本却没有先构建依赖。
- 打包脚本绕过 turbo `^build`，直接 `pnpm --filter <pkg> build`。

**快速扫描**
- `apps/desktop/src/preload/**` 搜 `require\(|import `，逐条确认来源。
- 根 `package.json` / `turbo.json` 检查 `build:web`、`dist:win` 的依赖链。
- 清空 `packages/*/dist` 后跑一次构建，验证不依赖历史产物。

**修复与回归范式**
1. preload 只保留 `require('electron')` 与类型导入。
2. 根构建脚本统一走 `turbo run build --filter=...`，由 `^build` 拉起依赖。
3. 回归：干净检出构建 + 安装版启动冒烟。

---

## P8 静默异常与后台任务

**症状**：功能偶发不生效但控制台无错误；进程偶发 `unhandledRejection`。

**代码信号**
- 空 `catch {}`、`catch(() => {})`、`catch(() => undefined)`。
- `void promise` / `promise.finally(...)` 没有挂 `catch`。
- 错误被转成 `null` 后继续执行，调用方无法区分“无数据”和“失败”。

**快速扫描**
- `apps/web/src`、`packages/core/src` 搜 `catch\s*\{\s*\}|catch\(\(\) =>|void .*\.finally|\.catch\(\(\) =>`。
- 对每处判断：失败是否应该上报、重试或至少记录。

**修复与回归范式**
1. 后台任务登记时先 `catch` 再跟踪，避免 unhandledRejection。
2. 可忽略的异常必须写明原因；其余至少 `console.warn` 或上报。
3. 回归：模拟拒绝路径，断言不产生未处理拒绝且状态可恢复。

---

## 7. 全仓巡检清单（建议每月一次）

按顺序执行，每项产出问题清单并去重 `bug-registry.md`：

1. **P1 上限一致性**：schema 数组上限列表 ↔ 前端提交体截断点 ↔ UI 禁用逻辑，三方比对。
2. **P2 进程回收**：所有 `spawn/exec` 逐条走成功/失败/超时三路径。
3. **P3 连接与竞态**：所有 `EventSource`/长驻 fetch/`setInterval` 逐条检查关闭与代际校验。
4. **P5 测试隔离**：新 spec 是否 reset/seed、固定名称 fixture 是否幂等。
5. **P6 端口与编码**：端口字面量、抓取解码路径。
6. **P8 静默异常**：空 catch 与 fire-and-forget 清单。
7. `pnpm check` + 全量 E2E；新增问题登记 B-xx 并标注模式编号。

## 8. 新缺陷归档模板

```
| B-xx | P1/P2/P3 | 领域 | 现象 | 根因（对应 P1–P8 哪个模式） | 修复 | 回归 | 提交 |
```

要求：
- 根因必须能归入某个模式；归不进去说明出现了新模式，回到本文档新增一节。
- 修复必须带可复现测试；测试名包含缺陷编号，便于反查。
