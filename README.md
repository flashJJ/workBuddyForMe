# WorkBuddy For Me

类 WorkBuddy 的**私人 AI 平台**：本地优先的多模型 AI 工作台，基于 Next.js 全栈 + Electron，提供多会话流式对话、知识库 RAG 问答、可视化工作流编排 Flow Studio、桌面 Agent 任务、智能体助手预设与统一的供应商管理。数据完全保留在本机 SQLite 中。

> 状态：v0.9.0｜平台：Windows（Web 模式跨平台）

## 功能

- **多会话 AI 对话**：SSE 流式输出、Markdown/代码高亮、中途停止、错误友好提示；工具调用（HITL 授权/熔断/超时门控）全程可观测。
- **Flow Studio 工作流（v0.8）**：在 `/flows` 画布上把知识检索、条件分支、大模型、工具、人工确认画成确定的 DAG；逐节点试运行调试，发布后以 `flow:<id>` 工具回到普通对话中被助手调用，对话卡片展示节点级子步骤。
- **Flow Serving 本地 API/MCP（v0.9）**：已发布流程可在编辑器「对外服务」中一键暴露——独立端点密钥（sha256 存储、可轮换/吊销）、本机 HTTP API（同步/异步 invoke、轮询、只读 SSE）、每密钥限流与环回 Host 防护；同时提供 **MCP Server**（streamable HTTP 与 stdio 双承载），任何 MCP 客户端（含应用自身「设置 → MCP 服务器」）都能发现并调用流程。无人值守触发按端点策略门控（默认拒绝写入/高危操作，桌面控制类永久禁止），运行与连接解耦（杀进程重启自动恢复），并提供运行记录中心与失败节点重放。
- **桌面 Agent 任务**：给助手一个桌面目标，观察屏幕 → 决策 → 执行的任务循环，逐步授权与急停。
- **知识库 RAG**：txt/md/pdf/docx 文档上传、自动分片向量化（sqlite-vec）、带引用来源的问答。
- **技能与 MCP**：文件夹式技能包（提示词 + 工具白名单），MCP stdio 服务器工具接入。
- **助手预设**：系统提示词、温度/topP/maxTokens、模型与知识库绑定，内置默认助手。
- **设置中心**：OpenAI 兼容供应商（DeepSeek/通义/Kimi/GPT/本地网关）配置、连接测试、模型管理；API Key 加密落盘、脱敏显示。
- **双端形态**：浏览器 Web 与 Electron Windows 桌面端同一套代码。

## 技术栈

Next.js 14（App Router + Route Handlers）· React 18 · TypeScript 5（strict）· Electron · better-sqlite3 + sqlite-vec · Tailwind CSS + Radix · pnpm + Turborepo · Vitest · Playwright

## 环境要求

- Node.js ≥ 20（当前开发机 Node 24 验证通过）
- pnpm ≥ 9（当前仓库随附 pnpm 11 配置）
- Windows 10/11（桌面打包）；Web 模式可在任意桌面平台运行

## 快速开始

```powershell
# 安装依赖
pnpm install

# Web 开发模式（仅监听 127.0.0.1:3000）
pnpm dev:web

# 桌面开发模式（自动拉起 Next dev，就绪后启动 Electron）
pnpm dev:desktop

# 或使用带环境自检的一键脚本（Windows PowerShell）
./scripts/dev-web.ps1
./scripts/dev-desktop.ps1
```

首次使用：打开「设置 → 供应商」添加 OpenAI 兼容供应商（baseURL / API Key）与模型，再回到「对话」开始使用。没有真实模型服务时，可给 Web 进程设置 `WBFM_MOCK_AI=1` 启用内置 Mock 供应商（模型 `mock-chat` / `mock-embed`，支持伪语义检索），完整体验对话与 RAG 流程。

### 把流程暴露给外部程序（v0.9）

在已发布流程的编辑器中点「对外服务」开启本地 API/MCP，密钥仅在创建/重置时展示一次：

```powershell
# 同步调用（超时自动返回 202 转异步，响应头 X-WBFM-Async=1）
curl.exe -X POST "http://127.0.0.1:3000/api/public/flows/<密钥>/invoke" `
  -H "Authorization: Bearer <密钥>" -H "Content-Type: application/json" -d '{}'

# 异步 + 轮询
curl.exe -X POST "http://127.0.0.1:3000/api/public/flows/<密钥>/invoke?mode=async" `
  -H "Authorization: Bearer <密钥>" -H "Content-Type: application/json" -d '{}'
curl.exe "http://127.0.0.1:3000/api/public/flows/<密钥>/runs/<runId>" `
  -H "Authorization: Bearer <密钥>"
```

MCP 接入（Claude Desktop 等支持 MCP 的客户端，或本应用「设置 → MCP 服务器」自举）：

```json
{
  "url": "http://127.0.0.1:3000/api/public/mcp",
  "headers": { "Authorization": "Bearer <端点密钥>" }
}
```

stdio 承载在桌面安装版中可用（端点对话框生成含内置 node 路径与 `WBFM_MCP_TOKEN` 的 spawn 配置）。公开 API 仅绑定 127.0.0.1、不接受 Cookie、无 CORS 放行；写入/高危工具默认拒绝，需在端点策略中逐项加入白名单（鼠标/键盘/窗口类桌面工具在任何策略下都禁止 API/MCP 调用）。

## 构建与发布

```powershell
pnpm build          # 构建所有包与 web（产物 apps/web/.next/standalone）
pnpm dist:win       # electron-builder 产出 Windows NSIS 安装包（Task 31）
```

## 测试与质量

```powershell
pnpm check:lines    # 单文件 ≤300 行硬门禁（含 --self-test）
pnpm typecheck      # 全仓 TS strict 类型检查
pnpm lint           # ESLint
pnpm test:unit      # 单元测试（覆盖率 ≥70%）
pnpm test:integration
pnpm test:e2e             # Web 关键路径 E2E（Playwright，内置 Mock 供应商）
pnpm test:e2e:desktop     # Electron 冒烟：构建 → 归集 standalone → pack:dir → 启动断言
```

## 数据与隐私

- 数据根目录默认 `%USERPROFILE%\.workbuddy-for-me`（Electron 下为 userData 注入路径），内含数据库、上传文件、向量缓存、密钥文件。
- API Key 永不明文出参、不明文落盘（详见 [架构文档 §7](docs/architecture.md#7-安全与隐私)）。
- 设置页支持数据导出（JSON，不含密钥明文）。

## 文档

- [架构设计](docs/architecture.md)
- [接口文档](docs/api.md)
- [开发与测试指南](docs/development.md)
- 模块设计：[设置](docs/modules/settings.md) ｜ [助手](docs/modules/assistants.md) ｜ [对话](docs/modules/chat.md) ｜ [知识库](docs/modules/knowledge.md) ｜ [Electron 外壳](docs/modules/electron-shell.md)

## 目录结构

```text
apps/
  web/        Next.js 全栈应用（页面 + API）
  desktop/    Electron 主进程、preload、打包
packages/
  shared/     领域类型 / Zod schema / 错误码
  config/     集中式数据根与环境（唯一事实源）
  database/   SQLite 连接、迁移、仓储
  ai/         HTTP 底座与模型供应商适配器
  core/       业务服务编排
scripts/      工程脚本（行数门禁等）
docs/         设计与说明文档
```
