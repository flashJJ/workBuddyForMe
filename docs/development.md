# 开发与测试指南

## 环境准备

1. 安装 Node.js ≥ 20 与 pnpm ≥ 9（corepack：`corepack enable`）。
2. 仓库根执行 `pnpm install`。Windows 下 pnpm 构建白名单已在 `pnpm-workspace.yaml`（`allowBuilds`）配置。
3. 推荐 VS Code 插件：ESLint、Prettier、Tailwind CSS IntelliSense。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev:web` | Next dev（127.0.0.1:3000） |
| `pnpm dev:desktop` | Electron 开发态（自动等待 Next dev 就绪） |
| `pnpm build` | Turborepo 全量构建（web 产出 `.next/standalone`） |
| `pnpm typecheck` / `pnpm lint` | 类型检查 / Lint（含分层边界规则） |
| `pnpm lint:boundaries` | 仅扫描分层边界违例（`import/no-restricted-paths`） |
| `pnpm check` | lint + typecheck + check:lines 聚合门禁 |
| `pnpm check:lines` | 300 行硬门禁 + 260 行预警（`--self-test` 自测） |
| `pnpm test:unit` | 全仓单元测试（覆盖率阈值阻断） |
| `pnpm test:integration` | Web API 集成测试全集（内存库 + 路由直调） |
| `pnpm test:e2e` | Web 关键路径 E2E（Playwright + Mock 供应商） |
| `pnpm test:e2e:desktop` | Electron 冒烟（构建 → 归集 → pack:dir → 启动断言） |

Windows 下另有带环境自检的一键脚本：`./scripts/dev-web.ps1`、`./scripts/dev-desktop.ps1`（检查 node/pnpm 版本与依赖安装后启动）。

## 环境变量参考

| 变量 | 作用 |
|---|---|
| `WBFM_DATA_ROOT` | 覆盖数据根目录（默认 `~/.workbuddy-for-me`） |
| `WBFM_MOCK_AI` | 置 `1` 时注入进程内 Mock 供应商（`mock-chat` / `mock-embed`，伪语义检索），无需真实模型服务 |
| `WBFM_SERVER_MANAGED` | `1` 启用托管模式令牌守卫（Electron 主进程注入） |
| `WBFM_TOKEN` | 托管模式访问令牌（启动时随机生成） |
| `WBFM_SERVER_PATH` | 覆盖 standalone server.js 路径（Electron 冒烟降级场景使用） |
| `WBFM_USER_DATA_DIR` | 覆盖 Electron userData（单实例锁/窗口状态落此；测试隔离用） |
| `WBFM_DEV` | 置 `1` 强制开发态行为（加载 dev server、打开 DevTools） |

## 编码约定

- **单文件 ≤ 300 行**：超出拆为子组件 / 纯函数；配置或生成文件走 `scripts/.lines-whitelist.json` 并写明理由。260–299 行为预警档（`pnpm check:lines` 列出但不阻断），热点在撞红线前即可见。
- 分层：页面只做装配；业务逻辑在 `packages/core`；数据访问走 repository；出站 HTTP 走 `packages/ai`。
- 路径：数据目录只能来自 `@wbfm/config` 的 `getDataRoot()`，禁止他处硬编码（仓库不变量测试强制）。
- 错误码：唯一事实源 `packages/shared/src/errors/error-codes.ts`；路由层经 `toErrorResponse` 归一（业务错误 / ProviderError / Zod 422 / 兜底 500）。
- 数据迁移：「读兼容、写收敛」——读取允许旧字段别名兜底，新写入只落规范字段。
- 外部请求：统一 ai 包 HTTP 底座（超时/退避/认证注入/错误归一化，5xx 重试耗尽→PROVIDER_ERROR，超时→PROVIDER_TIMEOUT，SSE 不重试），禁止前端直连供应商。

## 包发布形态（exports 条件）

每个包的 `.` 与各域子路径使用同一组条件：

- `types` / `development` → `src/...` TS 源（编辑器、Next dev、Vitest 直接消费源码）。
- 生产 import/require → `dist/index.mjs|cjs`（tsup 单 bundle，turbo `^build` 保证顺序）。
  子路径在生产条件下同样解析到根 bundle——v1.1 的域拆分是**源码架构边界**，不做产物级 chunk 拆分（避免跨 chunk 类身份多副本）。

### 域子路径（v1.1 M2 起）

跨包导入优先用域子路径，根 barrel（`@wbfm/<pkg>`）仅在 v1.1 兼容期保留；本仓内部消费已全部迁到子路径，新代码不要再写根 barrel 导入。

- `@wbfm/core`：`/agent` `/secrets` `/services` `/chat` `/memory` `/ingestion` `/retrieval` `/tools` `/computer` `/mcp` `/serving` `/skills` `/backup` `/share` `/flow` `/voice`
- `/voice`（v1.1 M3 起）：语音运行时编排（VoiceRuntime 引擎缓存键/sid 三级解析/settings 失效重建、模型下载与齐备性、语音设置读写）。它依赖 `@wbfm/voice`（sherpa-onnx-node 原生绑定），**有意不聚合进 core 根 barrel**，避免无关消费者被拉入原生模块图；生产条件指向独立打包入口 `dist/voice.*`（tsup 多入口，叶子域无跨入口类共享）。web 侧只保留 singleton（globalThis HMR）、withVoice SSE 传输桥与同签名 re-export 薄壳。
- `@wbfm/shared`：`/schemas` `/types` `/errors` `/api` `/constants` 及叶契约 `/backup` `/updater` `/pet` `/command`
- 域 barrel 只导出本域公开面；需要新跨域能力时，在对应 `src/<域>/index.ts` 增补导出，不要深链其他包的 `src` 文件。
- 测试里的 `vi.mock()` 按**模块说明符**拦截：改子路径导入后，mock 目标也要改成同一个子路径（如 `vi.mock('@wbfm/shared/constants')`），否则替换不生效。

## 分层与 internal 约定

依赖方向由 ESLint `import/no-restricted-paths` 机械强制（根 `.eslintrc.cjs` 与 `apps/web/.eslintrc.json`；v1.1 M0 起 warn，M5 翻 error），不依赖口头记忆：

```text
apps/web      → packages/{shared, config, database, ai, core, voice} 的公开面
apps/desktop  → packages/{shared, config}（桌面壳不碰业务与 DB）
packages/voice    → shared, config
packages/ai       → shared, config
packages/database → shared, config
packages/core     → shared, config, database, ai, voice（唯一聚合全部的编排层）
packages/shared, config → 不依赖任何业务包
另外：packages 不得反向依赖 apps；两个 apps 互不引用。
```

- **internal 私有目录**：包内仅供本包使用的实现放在 `src/<域>/internal/`。跨包/跨应用 import 任何包的 `internal/**` 会被规则命中；同包内部互相引用放行；测试文件（`*.test.*` / `*.spec.*` / `__tests__` / `__mocks`）允许跨层装配，规则关闭。
- 跨包消费只走公开面：包名导入（`@wbfm/<pkg>`）或域子路径；不要写指向其他包 `src` 的相对路径，也不要在 package.json 里声明违反上表的依赖（两者都会让门禁/typecheck 变红）。
- 自检命令：`pnpm lint:boundaries`（仓库根整体扫描，只看边界规则）；各包 `pnpm lint` 与 CI 同样执行该规则。
- 问答示例：**web 能不能 import core/internal？** 不能——web 只允许消费 core 的公开面；需要的能力应在 core 域 barrel 导出。测试里临时装配可以，非测试代码不行。

## 测试策略

### 分层与边界

- **单元测试**（`pnpm test:unit`）：config/database/ai/core statements ≥70%（Vitest 阈值阻断）；mock 边界为 fetch（供应商）、时间、数据根；不允许真实出网。
- **集成测试**（`apps/web/src/app/api/integration.test.ts`）：`mkdtempSync` 临时数据根 + 内存 SQLite + `__buildContainerForTest` 注入容器，路由 handler 直调 `new Request(...)`；覆盖级联删除、SSE 上游失败落库、错误码矩阵一致性等跨层行为。
- **Web E2E**（`tests/e2e/critical-path.spec.ts`，`pnpm test:e2e`）：Playwright 启动 next dev（端口 3100，`WBFM_MOCK_AI=1` + 临时数据根，`reuseExistingServer: !CI`），5 个串行场景：供应商/模型配置 → 流式对话与中途停止 → 知识库上传索引 → RAG 带引用问答 → 四模块导航。
- **Electron 冒烟**（`apps/desktop/e2e/smoke.spec.ts`，`pnpm test:e2e:desktop`）：`run-e2e.mjs` 串行执行 web build → desktop build → prepare-server（归集 standalone）→ electron-builder --dir → Playwright `_electron.launch`；断言窗口渲染、四模块导航、webPreferences 安全基线（contextIsolation/sandbox/no nodeIntegration）、托管令牌 401/200。

### Mock 供应商

测试与无真实模型环境统一使用 `packages/ai/src/mock-provider.ts`（`WBFM_MOCK_AI=1` 注入）：

- `mock-chat`：流式回显；system 含【参考资料】时基于检索片段作答；消息命中「长回答/详细说说」输出约 3.5 秒长文本，供「中途停止」场景操作。
- `mock-embed`：64 维多热编码（FNV-1a hash + 中文 2-gram），L2 归一化，共享 token 文本相似——驱动真实 top-k 检索链路。

### Windows Smart App Control 注意事项

SAC 开启时，electron-builder 重打包产生的未签名 exe（hash 每次变化）会被系统 Application Control 拦截。`run-e2e.mjs` 自动检测该状态并降级：复制官方签名 `electron.exe` 为 `WbfmElectronHost.exe`（字节不变，SAC 放行）加载打包产物 `app.asar`，`WBFM_SERVER_PATH` 指向打包内 standalone server——生产链路（fork server / cipher 桥 / 令牌守卫）验证等价。关闭 SAC 不可逆，如需验证真实 exe 请自行在系统安全中心操作。

## CI 工作流

`.github/workflows/ci.yml`（ubuntu-latest，Node 版本读 `.nvmrc`）：

1. `pnpm install --frozen-lockfile`
2. `pnpm check`（lint + typecheck + 300 行门禁）
3. `pnpm test:unit` → `pnpm test:integration`
4. `pnpm build:web` → `playwright install --with-deps chromium` → `pnpm test:e2e`
5. 失败时上传 `apps/web/test-results` 与 `playwright-report` 产物

Electron 冒烟需 Windows 环境（better-sqlite3 原生重编译 + electron-builder），质量 CI 未纳入，本机执行 `pnpm test:e2e:desktop`。

`.github/workflows/release.yml`（windows-latest）负责安装包发布：手动触发只产出 artifact；推送 `v*` 标签时构建 NSIS 并发布 **draft** Release（含 latest.yml/blockmap）。流水线会校验标签名与 root package.json 版本一致（`pnpm sync-version:check`），并在打包后运行 `apps/desktop/scripts/verify-artifacts.ps1` 校验版本资源（配置了签名证书时同时校验签名链）。

### Windows 本机构建的 winCodeSign 前置

electron-builder 的 rcedit（写入 exe 图标/版本资源）依赖 `winCodeSign-2.6.0` 工具包。CI 的 Windows runner 可直接解压；**本机非提权终端**解压会因包内两个 macOS dylib 符号链接失败（`Cannot create symbolic link`，7za 报 Sub items Errors 2），需一次性预置缓存：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
# 触发一次下载（会失败并留下 <随机数>.7z），随后手工解压（忽略 darwin 符号链接错误）：
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$7z = "node_modules\7zip-bin\win\x64\7za.exe"
& $7z x "$cache\<下载得到的>.7z" "-o$cache\winCodeSign-2.6.0" -y   # 两个 dylib 报错可忽略
```

之后 `dist:win`/`pack:dir` 正常。一劳永逸方案是开启 Windows「开发者模式」（赋予非提权符号链接权限）。

## 发版流程

发版前：

1. `pnpm check` → `pnpm test:unit` → `pnpm test:integration` → `pnpm build`。
2. `pnpm test:e2e`；Windows 机器执行 `pnpm test:e2e:desktop`。
3. 数据兼容检查：`data/` 下 SQLite 迁移幂等；发布前用旧版本数据目录启动验证「读兼容」。
4. 升版只改 root package.json 的 version，执行 `pnpm sync-version`（同步 apps/web、apps/desktop 的 package.json 与 `packages/shared/src/version.ts`），提交。

发版：

5. 合入 main 后打附注标签 `vX.Y.Z` 并推送 → release.yml 在 Windows runner 上产出 NSIS 并创建 **draft** Release。
6. 在 GitHub 编辑 draft Release：核对资产（exe/blockmap/latest.yml 三件套）、补发行说明，人工转正式发布。
7. 真机验证：旧版安装包应用内「检查更新」走完整更新链；全新安装走首次启动向导（详见各版本真机验收清单）。

本机构建（调试安装器）用 `pnpm --filter @wbfm/desktop dist:win`（自动 build web → 归集 → electron-builder，`--publish never`），产物在 `apps/desktop/release/`。

### 代码签名（当前未购买证书）

无证书时构建自动跳过全部 signtool（node.exe/elevate.exe/uninstaller/Setup 四点），但 rcedit 正常写入图标与版本资源，安装与自动更新不受影响，代价是首次运行 SmartScreen 可能拦截（引导用户选「仍要运行」）。购买 OV/EV 证书后启用签名，无需改代码：

1. 仓库 Settings → Secrets 添加 `CSC_LINK`（pfx 证书的 base64）与 `CSC_KEY_PASSWORD`；
2. 重跑标签发布，release.yml 自动签名并加时间戳（CI 内构建时间与打包机时区无关）；
3. 产物自检会在检测到 `CSC_LINK` 时额外校验签名链为 Valid。

> appId `com.wbfm.desktop` 与 productName 已冻结：更改会被 electron-updater 识别为不同应用并切断跨版本更新链。
