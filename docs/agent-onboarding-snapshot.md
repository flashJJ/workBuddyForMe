# 智能体上手快照（2026-11-20 / v4.15.0）

> 用途：新窗口的智能体在 5 分钟内建立项目心智模型。先读本文件，再按 §11 打开对应文档。
> 生成时的基线：`main` = `030fd5c6`（chore(release): 发布 v4.15.0），tag `v4.15.0`，工作分支 `main`。

## 1. 项目定位

WorkBuddyForMe：本地优先的私人 AI 桌面平台。Next.js 15 全栈 Web + Electron 45 桌面壳，SQLite 落盘，数据不出本机；包含对话、助手、知识库、任务/计划、会议、Flow、能力包、桌宠/舞台/语音/音乐等模块。

- 许可证：PolyForm Noncommercial 1.0.0
- 包管理：pnpm 11.24（`packageManager` 字段锁定）+ Turborepo
- Node：>= 22.13（推荐 24）

## 2. 当前状态

| 项 | 值 |
|---|---|
| 版本 | 4.15.0（已合 main、已打 tag `v4.15.0`、已发布） |
| 安装包 | `WorkBuddyForMe-Setup-4.15.0.exe`，270,056,914 字节（约 257.5 MB） |
| SHA256 | `5411a97138adcfeeffda2c2b426b103710983c9f8888e46087f066328acb3258` |
| 构建 commit | `030fd5c6`（build-info.json 记录 branch/commit/builtAt） |
| 数据库 | 零迁移，`LATEST_SCHEMA_VERSION = 53` |
| 测试基线 | `pnpm check` 全绿；shared / web / desktop 全量单测通过（数量以 `pnpm test:unit` 实时输出为准） |

远端纪律：内部镜像与 GitHub 均可推送，具体地址与账号不在此记录；发布前确认目标远端与标签。

## 3. 仓库结构

```
apps/web        Next.js 15 App Router 全栈（页面 + API + 大部分业务 UI）
apps/desktop    Electron 主进程/preload、透明桌宠窗、本地背景文件 IPC、打包
packages/core   领域服务（记忆/知识/会议/Flow/能力包/媒体等）与 repository
packages/database  SQLite schema、迁移、仓储实现
packages/shared 契约层：zod schema、类型、i18n 文案、IPC bridge 类型
packages/ai     出站 HTTP/供应商适配（唯一允许请求模型的层）
packages/voice  ASR/TTS 运行时
packages/config 数据根目录等运行配置
packages/motion 动效内容包运行时
scripts/        门禁、资产、打包、归档、评测脚本
docs/plan/vX.Y/ 版本方案（README/spec/tasks/progress-log/release-notes/version-summary）
docs/roadmap/   路线图、候选与已排期方案
blog/vX.Y/      每版 7 篇左右技术博客（早期版本 10 篇）
tests/          e2e（Playwright）与跨包测试夹具
```

## 4. 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev:web` | Next dev，127.0.0.1:42337 |
| `pnpm dev:desktop` | Electron 开发态（依赖 Next dev；CDP 42338） |
| `pnpm check` | 全量门禁：typecheck + lint + lines + structure + cycles + msw + ascii + assets + surfaces |
| `pnpm test:e2e:visual` | 视觉巡检截图（默认跳过，需显式开关；基线只在固定 Linux 环境生成） |
| `pnpm test` | Turbo 全仓测试（含覆盖率阈值） |
| `pnpm --filter @wbfm/web typecheck` | 单包类型检查 |
| `pnpm --filter @wbfm/web exec vitest run src/features/xxx` | Web 定向测试（**必须**在 `apps/web` 目录跑，根目录跑会解析不到 `@/` 别名） |
| `pnpm build:web` / `pnpm build` | Web 生产构建 / 全仓构建 |
| `pnpm archive:win` | 把 `apps/desktop/release` 产物归档到 `<构建归档>\vX.Y.Z` |
| `node scripts/release-manifest.mjs --check --dir <归档目录>` | 复算 3 个产物哈希 |

端口：Web dev 42337、Electron CDP 42338；测试类固定端口取 32xxx（E2E 32339、验收 32341、工具评测 32342、夹具 32101–32104），低于 Linux 临时端口段以避免 `bind EADDRINUSE`。

## 5. 打包与归档（Windows 本地）

```powershell
# 1) Web 生产构建（会写 .next/standalone）
pnpm --filter @wbfm/web build

# 2) 主进程构建 + 归集 standalone 服务端
cd apps\desktop
pnpm build
node scripts/prepare-server.mjs

# 3) 临时本地构建配置（仓库不保留，构建后删除）
#    electron-builder.local.yml:
#    extends: ./electron-builder.yml
#    electronDist: ../../node_modules/electron/dist
pnpm exec electron-builder --win --x64 --publish never --config electron-builder.local.yml

# 4) 归档 + 校验
cd ..\..
pnpm archive:win
node scripts/release-manifest.mjs --check --dir <构建归档>\v4.15.0
```

注意：
- 打包前停掉 `pnpm dev:web`（与 `.next` 目录冲突）。
- 本机 Electron 45.0.0 必须走 `electronDist`，否则 electron-builder 可能联网下载。
- 归档脚本会移动并清空 `apps/desktop/release`，同时生成 `SHA256SUMS.txt`、`build-info.json`、`latest.yml`、blockmap。
- 构建信息里的 commit 是构建时工作区 HEAD，发布文档要回填真实值。

## 6. 工程纪律（硬门禁）

- 单文件 ≤ 300 行（260 行预警）；目录直接文件 ≤ 12。
- 跨 feature 只能走公开入口 `index.ts`；禁止深引用其他 feature 内部文件（`lint:boundaries`）。
- 路径只能来自 `@wbfm/config` 的 `getDataRoot()`。
- 错误码唯一事实源在 `packages/shared/src/errors/error-codes.ts`。
- 外部请求统一走 `packages/ai` 底座，前端不得直连供应商。
- 文档里的架构/流程/状态图用 Mermaid；中文 ASCII 图只允许右侧开放框（`check:ascii`）。
- 表面样式只允许用语义 token（见 §8.4），`check:surfaces` 会拦截裸 `bg-card`/`bg-background` 等。
- 提交前至少跑：`pnpm check` + 受影响包的定向测试。

## 7. 版本迭代固定流程

1. 从最新 main 切 `feat/vX.Y-<slug>`。
2. 先写 `docs/plan/vX.Y/`：README（目标/非目标）→ spec（契约）→ tasks（里程碑勾选）→ progress-log（边做边记）。
3. 按里程碑开发，每个里程碑跑 typecheck + 定向测试；完成后全量 `pnpm check` + `pnpm test`。
4. 补 release-notes、version-summary、`blog/vX.Y/B01–B07`（篇数以版本实际技术点为准），回填安装包体积/哈希/commit。
5. 真机安装验证通过后：`git merge --no-ff` 到 main → `git tag -a vX.Y.Z` → `git push tencent main` + `git push tencent vX.Y.Z`；再推 `origin` 的 main 与 tag 触发 GitHub Release workflow（Draft 需人工核对安装包、`latest.yml` 与 blockmap 后转正）。
6. 未验证前不合 main、不打 tag。

## 8. 关键架构与约定

### 8.1 分层

- 页面只做装配；业务在 `packages/core`；数据访问走 repository；模型请求走 `packages/ai`。
- 迁移原则「读兼容、写收敛」。

### 8.2 设置存储

- `PUT /api/settings` 对顶层字段**整体替换**。写 `background` 时必须提交 `main/stage/pet` 三个作用域的完整配置，否则会冲掉未提交字段（v4.4 已踩坑）。
- 设置查询用 React Query（`useSettings`），跨窗口用 `BroadcastChannel` 失效。

### 8.3 背景与壁纸契约（v4.4）

- 契约：`packages/shared/src/schemas/media/background/index.ts`
- 三作用域：`main`（主窗口，含 `mode: chat | window`，**缺省 window 整屏**）、`stage`、`pet`（仅桌面桌宠窗，默认无背景保持透明）。
- 来源：`builtin`（内置 id）/ `image` / `video`（本地文件或壁纸包）。
- 默认：主窗口 `wallpaper.main.forest-camp-loop`（森林露营），`fit: cover`、`dim: 0.15`、`blur: 0`。
- 渲染：`apps/web/src/features/background/background-layer.tsx`；`blur` 只作用于背景层本身；内置视频带 `poster` 首帧，加载失败按 1s/2s/4s 重试 3 次（v4.4 慢加载兜底）。
- 内置视频源分辨率较低（森林露营/深夜办公室 854×480，雨夜 1280×720）；整屏 + 高 DPI 会放大发虚，属素材限制，不是 CSS 模糊。

### 8.4 表面层级（Surface System）

- 方案：`docs/plan/v4.4/surface-system.md`；登记表：`docs/plan/v4.4/surface-registry.md`。
- L0 背景 / L1 工作区与侧栏 / L2 卡片面板 / L3 行与子块 / L4 控件 / L5 弹层（实色）。
- token（`apps/web/src/app/globals.css`）：
  - 亮色：`--ui-canvas` 0.50、`--ui-chrome` 0.52、`--ui-card` 0.64、`--ui-row` 0.76、`--ui-control` 0.90；
  - 暗色：0.54 / 0.56 / 0.68 / 0.80 / 0.92。
- **表面层一律不做 `backdrop-filter`**；整窗模糊只由背景 `blur` 参数驱动。
- 只有整屏模式（`[data-main-background='window']`）才把 `app-glass-surface` / `app-workspace-glass` 切到 L1；聊天模式保持近实色。
- 设置面板等结构性面板必须自带 L2 卡壳（`rounded-lg border bg-ui-card p-4`）。
- 舞台、桌宠、背景媒体、调试页是独立体系白名单（理由见登记表 §9）。

### 8.5 i18n

- 零依赖自研，`packages/shared/src/i18n/messages/*` 为唯一文案源；中英双语，命名空间按模块划分。

## 9. v4.15 本轮改动摘要（便于理解现状）

- 删除两个不可达的动作变体（触发场景 / 发起聊天），执行器守卫下移，字幕不再依赖表现控制器。
- 桌宠右键新增「聊两句」：聚焦主窗并预填草稿，只传白名单语义键，不自动发送。
- 视觉巡检 L1：设置页基础区、记忆面板、上下文洞察面板接入截图基线；CI 首月非阻断并上传差异产物。

## 10. 已知坑

1. **开发态单实例锁**：已安装版或旧 Electron 未退出时，`pnpm dev:desktop` 不会开新窗；先结束 `WorkBuddyForMe` 进程。
2. **dev server 掉线**：Electron 窗口会停在错误页；重启 `pnpm dev:web` 后刷新即可。
3. **根目录跑 web 测试**会解析不到 `@/` 别名，还会扫到 `apps/desktop/resources/server` 的构建副本；务必在 `apps/web` 下执行 vitest。
4. **打包会清空** `apps/desktop/release`；归档后源目录为空，这是脚本行为。
5. **设置保存**是顶层替换，不要只提交局部 `background`。
6. **SSR/水合**：依赖查询数据切换 DOM 结构的面板要加 `mounted` 门控（参见 `tuning-panel.tsx` 等）。
7. **视频请求失败**不会自动无限恢复：重试 3 次后停在封面，刷新恢复；这是有意的降级。
8. **视觉基线只在固定 Linux 环境生成**；本地 Windows 快照提交后会让 CI 比对失真。
9. `check:surfaces` 目前基线 0，任何新增裸表面类都会让门禁失败。
10. 中文文档里的 ASCII 框图容易错位，优先 Mermaid。

## 11. 关键文件索引

| 主题 | 文件 |
|---|---|
| 开发/测试/环境变量 | `docs/development.md` |
| 路线图与版本索引 | `docs/roadmap/README.md` |
| 当前版本方案 | `docs/plan/v4.15/spec.md`、`tasks.md` |
| 发布说明 | `docs/roadmap/v4.15.0-release-notes.md` |
| 表面体系 | `docs/plan/v4.4/surface-system.md`、`surface-registry.md` |
| 背景契约 | `packages/shared/src/schemas/media/background/index.ts` |
| 背景渲染 | `apps/web/src/features/background/*` |
| 背景设置面板 | `apps/web/src/features/settings/appearance/background-settings-panel.tsx` |
| 全局样式/token | `apps/web/src/app/globals.css` |
| 打包脚本 | `apps/desktop/package.json`、`apps/desktop/scripts/prepare-server.mjs`、`scripts/archive-installer.ps1`、`scripts/release-manifest.mjs` |
| 门禁脚本 | `scripts/check-file-lines.mjs`、`check-structure.mjs`、`check-cycles.mjs`、`check-surfaces.mjs`、`assets/check-assets.mjs` |

## 12. 新窗口起步清单

1. 读本文件 §2 确认基线，再读 `docs/plan/v4.15/tasks.md` 与 `docs/roadmap/v4.15.0-release-notes.md`。
2. 跑一次 `pnpm check` 确认环境干净（约 1–2 分钟）。
3. 若要改 UI：先查 `surface-registry.md`，只选 token，不写裸表面类。
4. 若要改背景：先读 §8.3，注意三作用域完整提交与 `isChatMode` 缺省整屏。
5. 若开新版本：按 §7 建 `docs/plan/vX.Y/`，先方案后编码。
6. 任何发布动作：只推 `tencent`，真机验证通过后才 merge main / 打 tag。
