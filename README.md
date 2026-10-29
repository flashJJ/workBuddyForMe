# WorkBuddyForMe

本地优先的**私人 AI 工作台**：用 Next.js 全栈 + Electron，把多模型对话、知识库 RAG、可视化工作流、对外服务、桌面 Agent、多智能体会议与长期陪伴角色装进一台电脑。默认不需要云账号，数据、密钥与向量索引留在本机。

> 当前版本：**v2.11.0**（2026-10-30）｜桌面端：Windows 10/11 x64｜Web 模式可跨平台

## v2.11.0 重点

- **六类 effect 全接通**：能力包可安装/启停/卸载 `skill`、`mcp`、`workflow`、`pet-action`、`event-script`、`report-widget`；坏包逐类 422，回滚不留半成品。
- **剧本与卡片**：事件 schema 支持字面量 `title`/`text`；安装剧本按短语触发并受导演三道锁约束；报告 JSON 新增 `widgets`，报告页渲染声明式卡片。
- **外部代理（本地 CLI）**：默认关、逐次审批、JSON Lines 协议、超时/输出上限/取消杀进程树；运行落 `subagent_runs` + WorkSignal + `session_events`，终态幂等回投。
- **管理页收口**：`/capabilities` kind 筛选、effect 详情、六类示例下载与外部代理区；设置页「来自能力包的剧本」列表与试演深链；桌面目录选择。
- **数据与迁移**：迁移 **v040** 纯加法（workflows 来源列 + 剧本/卡片/外部代理运行三表）；版本 **2.11.0** 统一同步。
- **工程门禁**：`pnpm check` 与 8 包单测全绿；生产模式 Web e2e 122/122、桌面冒烟 10/11（`computer-input` 环境相关）。

## 功能

### 对话与助手

- 多供应商、多模型接入；SSE 流式输出、Markdown / 代码高亮、中途停止与友好错误提示。
- 工具调用全程可观测，支持 HITL 授权、熔断与超时门控；工具循环 ≤ 5 轮。
- 助手预设：系统提示、角色卡、温度 / topP / maxTokens、模型与知识库绑定、工具 / 技能白名单。
- 对话中断或连接断开时，已生成内容保留并落库，不丢失部分结果。

### 知识库 RAG

- 支持 txt / md / pdf / docx 上传、网页剪藏与扫描件 OCR（vision / tesseract）。
- 自动分片与向量化（sqlite-vec），并结合 FTS 混合检索、RRF 融合与规则重排。
- 回答携带页 / 段 / 字符级引用，可回到原文；无 Embedding 模型时明确返回 422。
- 文档状态：`pending → processing → indexed / partial / failed`；失败可重试。

### Flow Studio

- 在画布上把知识检索、条件分支、LLM、工具、人工确认编排成确定的 DAG。
- 节点级试运行、发布 / 版本管理、运行记录与失败节点重放。
- 已发布流程可作为 `flow:<id>` 工具回到普通对话中，由助手调用并展示节点级子步骤。

### Flow Serving 与 MCP

- 一键把已发布流程暴露为本地 HTTP API：同步 / 异步 invoke、轮询与 SSE。
- 独立端点密钥（sha256 存储、可轮换 / 吊销）、按 Key 限流、仅回环 Host 防护。
- MCP Server 支持 streamable HTTP 与 stdio 双承载，可被外部 MCP 客户端或应用自身发现调用。
- 无人值守触发按端点策略门控；默认拒绝写入 / 高危操作，鼠标 / 键盘 / 窗口类桌面工具永久禁止 API / MCP 调用。

### 桌面 Agent 与多智能体会议

- 桌面 Agent：目标 → 观察屏幕 → 决策 → 执行，支持逐步授权、急停与运行事件观测。
- 多智能体会议：manual / all / auto 三种调度，≤ 8 轮，串行语音 / 表情；首版不直连工具 / MCP / 知识库。

### 陪伴与形象

- 角色卡、情绪三变量、亲密 / 信任关系、关系里程碑与长期记忆。
- 提醒与事件触发、Live2D / VRM 桌宠、舞台场景与 `.wbfm-pack` 导入导出。
- 本地语音输入与朗读（sherpa-onnx，离线）；语音模型按需下载。

### 设置、数据与安全

- 设置中心：供应商、模型、语音、MCP / 技能与更新检查。
- API Key 加密落盘、脱敏显示；数据导出不包含密钥明文。
- 仅监听 `127.0.0.1`；Electron 托管模式校验 `X-WBFM-Token`。
- `contextIsolation` + `sandbox` + 无 `nodeIntegration`；出站请求带 SSRF 防护。
- 单机单用户，无云账号、无多租户。

## 技术栈

| 层 | 选型 |
|---|---|
| 运行时 | Node.js 24（`.nvmrc`；root engines ≥ 22.13）· pnpm 11.24 · Turborepo |
| Web | Next.js 15.5.28（App Router + Route Handlers）· React 19.3.1 · TypeScript 5.9（strict）· Tailwind CSS 3.4 · Radix UI |
| 桌面 | Electron 44.9.3 · electron-builder 26.18.0 · electron-updater 6.8.11 · `@nut-tree-fork/nut-js` 4.2.6 |
| 数据 | better-sqlite3 · sqlite-vec（vec0）· SQLite WAL · 本地文件存储 |
| AI / 语音 | OpenAI-compatible · Ollama · sherpa-onnx-node |
| 质量 | Vitest · Playwright · ESLint 分层边界 · 单文件 ≤ 300 行门禁 |

## 架构

pnpm + Turborepo monorepo：

```text
apps/
  web/        Next.js 全栈应用（页面 + 124 个 API Route Handlers）
  desktop/    Electron 主进程、preload、打包
packages/
  shared/     领域类型 / Zod schema / 错误码
  config/     数据根与环境变量（唯一事实源）
  database/   SQLite 连接、迁移、仓储
  ai/         Provider 适配、HTTP / SSE 底座
  core/       业务编排（chat / RAG / flow / agent / memory / serving / tools / voice）
  voice/      sherpa-onnx 语音运行时
scripts/      工程脚本（行数门禁、发布归档等）
docs/         架构、开发、模块与版本方案
```

依赖方向：`apps/web → packages/core → 基础设施`；`apps/desktop → shared / config`。跨包只走公开面，`internal/**` 禁止跨层引用，由 ESLint `import/no-restricted-paths` 机械强制。

## 环境要求

- Node.js 24（推荐；`.nvmrc`），root `engines` 要求 ≥ 22.13。
- pnpm 11.24（`packageManager`；可用 `corepack enable`）。
- Windows 10/11 x64（桌面打包）；Web 模式可在任意桌面平台运行。
- 可选：本地 Ollama 或 OpenAI-compatible 供应商；没有真实模型时可用 `WBFM_MOCK_AI=1` 跑通对话与 RAG。

## 快速开始

```powershell
# 安装依赖
pnpm install

# Web 开发模式（仅监听 127.0.0.1:3000）
pnpm dev:web

# 桌面开发模式（自动等待 Next 就绪后启动 Electron）
pnpm dev:desktop

# 或使用带环境自检的一键脚本（Windows PowerShell）
./scripts/dev-web.ps1
./scripts/dev-desktop.ps1
```

首次启动向导支持演示模式、厂商预设与本机 Ollama 探测；也可以在「设置 → 供应商」添加 OpenAI-compatible 供应商（baseURL / API Key）与模型，再回到「对话」开始使用。

## 对外服务示例

已发布流程可在编辑器中开启「对外服务」，密钥仅在创建 / 重置时展示一次：

```powershell
# 同步调用（超时自动转异步，响应头 X-WBFM-Async=1）
curl.exe -X POST "http://127.0.0.1:3000/api/public/flows/<key>/invoke" `
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{}'

# 异步调用 + 轮询
curl.exe -X POST "http://127.0.0.1:3000/api/public/flows/<key>/invoke?mode=async" `
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{}'
curl.exe "http://127.0.0.1:3000/api/public/flows/<key>/runs/<runId>" `
  -H "Authorization: Bearer <key>"
```

MCP 接入（支持 MCP 的客户端，或本应用「设置 → MCP 服务器」自举）：

```json
{
  "url": "http://127.0.0.1:3000/api/public/mcp",
  "headers": { "Authorization": "Bearer <key>" }
}
```

公开 API 仅绑定 `127.0.0.1`、不接受 Cookie、无 CORS 放行；写入 / 高危操作默认拒绝，需在端点策略中逐项加入白名单。stdio 承载在桌面安装版中可用。

## 构建与发布

```powershell
pnpm build          # 构建所有包与 Web（产物 apps/web/.next/standalone）
pnpm dist:win       # 归集 standalone 并产出 Windows NSIS 安装包
pnpm release:win    # 出包并归档产物
```

## 测试与质量

```powershell
pnpm check                # typecheck + lint + 300 行门禁
pnpm check:lines          # 仅行数门禁（含 --self-test）
pnpm test:unit            # 单元测试（覆盖率阈值阻断）
pnpm test:integration     # Web API 集成测试
pnpm test:e2e             # Web 关键路径 E2E
pnpm test:e2e:desktop     # Electron 冒烟：构建 → 归集 → pack:dir → 启动断言
```

v2.11.0 发布准备：`pnpm check` 与 8 包单测全绿；全量 Web e2e **122/122**（CI 模式 `next start` 生产产物）、桌面冒烟 10/11（`computer-input` 环境相关）；安装包 `WorkBuddyForMe-Setup-2.11.0.exe` 192.49 MB。详见 [v2.11 M5 验收](docs/plan/v2.11/06-M5-验收.md)。

## 数据与隐私

- 数据根目录默认 `%USERPROFILE%\.workbuddy-for-me`；Electron 通过 `WBFM_DATA_ROOT` 注入 userData 路径。
- 数据根内含 SQLite 数据库、上传文件、语音模型与密钥密文；向量以 `sqlite-vec` 虚表保存在同一数据库。
- API Key 使用 safeStorage / AES-256-GCM 加密落盘，UI 只显示脱敏值，永不明文出参。
- 备份建议：退出应用后整目录复制；密钥密文与系统账户绑定，跨机恢复需重新录入供应商密钥。
- 服务仅监听回环地址；托管模式启用 `X-WBFM-Token`；桌面端启用 `contextIsolation`、`sandbox` 并禁用 `nodeIntegration`。

## 文档

- [架构设计](docs/architecture.md)
- [接口文档](docs/api.md)
- [开发与测试指南](docs/development.md)
- [Electron 桌面外壳](docs/modules/electron-shell.md)
- 模块设计：[设置](docs/modules/settings.md) ｜ [助手](docs/modules/assistants.md) ｜ [对话](docs/modules/chat.md) ｜ [知识库](docs/modules/knowledge.md)
- 版本路线：[产品路线图](docs/roadmap/README.md) ｜ [v2.7–v2.10 路线](docs/plan/v2.7-v2.10/README.md)

## 许可

GPL-3.0-only（见根 `package.json`）。
