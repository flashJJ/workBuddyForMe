# WorkBuddy For Me 技术博客系列

> 一个本地优先 AI 平台的实战复盘，12 篇文章覆盖架构、桌面端、安全、RAG、测试、CI 全链路。

## 文章目录

### 架构与工程化

| # | 标题 | 关键词 |
|---|---|---|
| 01 | [一个人的 AI 平台怎么搭？pnpm Monorepo 分层实战](01-monorepo-architecture.md) | Monorepo、分层架构、依赖单向、Turborepo |
| 02 | [为什么我给项目设了「单文件 ≤300 行」的硬规则](02-300-line-rule.md) | 代码规范、门禁脚本、可维护性 |

### 桌面端与安全

| # | 标题 | 关键词 |
|---|---|---|
| 03 | [Electron 打包后窗口 30 秒不出现：一个 ABI 不匹配的血案](03-electron-abi-pitfall.md) | Electron、Node ABI、fork、native 模块 |
| 04 | [本地 AI 应用的密钥保卫战：safeStorage 桥接设计](04-secret-storage-bridge.md) | 密钥加密、safeStorage、令牌守卫、脱敏 |
| 08 | [Electron 桌面应用的进程模型：为什么 fork Next.js standalone](08-electron-process-model.md) | Electron 架构、standalone、进程模型 |

### AI 与数据

| # | 标题 | 关键词 |
|---|---|---|
| 05 | [SQLite + sqlite-vec：100 篇文档内的私域知识库怎么做](05-sqlite-vec-rag.md) | RAG、向量检索、sqlite-vec、分片 |
| 06 | [SSE 流式对话是怎么炼成的：从上游 chunk 到前端渲染](06-sse-streaming-chat.md) | SSE、流式对话、中断语义、异步生成器 |
| 07 | [一套代码接入所有大模型：OpenAI 兼容适配器设计](07-openai-compatible-provider.md) | Provider 抽象、OpenAI 兼容、HTTP 重试 |

### 工程质量

| # | 标题 | 关键词 |
|---|---|---|
| 09 | [统一响应包络 + 领域错误码：让前后端吵架变少](09-api-envelope-error-codes.md) | API 契约、错误码、Zod、端到端校验 |
| 10 | [外部模型调用 100% mock：四层测试体系的取舍](10-four-layer-testing.md) | 测试策略、mock、覆盖率、依赖注入 |
| 11 | [一个人的项目也要有 CI：本地一键脚本与 GitHub Actions](11-ci-one-person.md) | CI/CD、Turborepo 缓存、质量门禁 |

### 复盘

| # | 标题 | 关键词 |
|---|---|---|
| 12 | [从 0 到 1 做一个本地 AI 平台，我学到了什么](12-retrospective.md) | 复盘、避坑指南、独立开发心法 |

## 阅读建议

- **想了解整体架构**：01 → 08 → 12
- **踩坑向**：03 → 04 → 05
- **AI 核心**：06 → 07 → 05
- **工程质量**：02 → 09 → 10 → 11

## 关于脱敏

所有文章均已脱敏处理，不包含真实 API Key、内部路径、项目代号。技术细节基于真实实现抽象而来，可放心参考。
