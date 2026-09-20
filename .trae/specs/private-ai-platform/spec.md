# WorkBuddy For Me（私人 AI 平台）- 产品需求规格说明书

## Overview

- **Summary**: 构建一个类 WorkBuddy 的私人 AI 平台（代号 WorkBuddy For Me，下称 WBFM）。采用 pnpm monorepo 组织，以 Next.js 全栈应用（React + Node Route Handlers）为核心，通过 Electron 内嵌为桌面应用，同一套代码同时支持 Web 本地访问与 Windows 桌面端运行。MVP 提供多会话流式 AI 对话、知识库 RAG 问答、智能体/助手预设、设置中心四大模块，并配套接口文档、架构/设计文档、说明文档与分层自动化测试。
- **Purpose**: 让个人用户在本机私有环境中统一管理多个大模型供应商，沉淀个人知识库与可复用助手，获得安全、可离线数据留存、可扩展的 AI 工作台。
- **Target Users**: 个人开发者/知识工作者；需要在本地管理 API Key、对话记录与私有文档，注重数据隐私与单机可运行性的用户。

## Goals

- 一套代码双端运行：浏览器本地 Web 与 Electron Windows 桌面端功能一致。
- 四大核心模块闭环可用：设置中心 → 助手预设 → 流式对话 → 知识库 RAG。
- 供应商可配置：通过 OpenAI 兼容协议接入 DeepSeek、通义千问、Kimi、GPT、本地网关等；Provider 层可扩展，预留 Ollama 适配器。
- 数据完全本地化：SQLite + 本地向量表，集中式数据目录，易备份易迁移。
- 工程化达标：功能按模块/组件拆分，单文件不超过 300 行；单元测试、集成测试、E2E 测试齐备；文档齐备。

## Non-Goals

- 不做云端账号体系、多用户协同、权限系统与服务端部署形态（本期仅单用户本地使用）。
- 不实现移动端、不做 macOS/Linux 安装包的发布验证（代码保持跨平台兼容，交付以 Windows 为主）。
- 不实现语音、图像生成、插件市场、工作流编排画布等增强能力。
- 不内置任何真实 API Key 或代理服务；不承诺特定模型供应商的可用性。
- 除接口预留外，本期不实现 Ollama 适配器的具体功能与 Anthropic/Gemini 原生协议。

## Background & Context

- 工作目录为空，项目从零搭建；操作系统为 Windows。
- 已确认的架构决策（用户审批）：
  1. 后端形态：Next.js 全栈（App Router + Route Handlers），Electron 主进程以内嵌方式拉起 Next 服务并加载窗口。
  2. MVP 模块：多会话 AI 对话（SSE 流式）、知识库管理 + RAG、智能体/助手预设、设置中心。
  3. 模型接入：OpenAI 兼容协议（可配置 baseURL / API Key / 模型名），抽象 Provider 接口并预留 Ollama。
  4. 存储：SQLite（better-sqlite3）+ 本地向量表（sqlite-vec），单机免部署。
- 同类项目经验约束：
  - 数据根目录必须由集中式路径解析函数统一提供，禁止各模块自定义路径常量。
  - 数据结构迁移采用「读兼容、写收敛」策略。
  - 外部 HTTP 调用统一封装（超时、退避重试、认证头注入、错误归一化），渲染进程/前端不直连供应商。

## Functional Requirements

### 设置中心

- **FR-1**：支持供应商配置的增删改查：名称、baseURL、API Key、协议类型（openai-compatible / ollama 预留）、启用状态。
- **FR-2**：支持在供应商下维护模型列表（模型 ID、显示名、能力标签：chat / embedding、上下文长度），可手动新增。
- **FR-3**：提供「连接测试」能力，后端以最小请求验证供应商可用性并返回归一化结果（成功/失败原因）。
- **FR-4**：支持设置当前默认对话模型与默认 Embedding 模型；支持通用偏好（主题、语言）。
- **FR-5**：API Key 在任何接口响应中均不得以明文返回；落盘加密（Electron 环境使用 safeStorage，Web 环境使用本地密钥文件 + AES-256-GCM）。
- **FR-6**：支持数据目录展示与数据导出（JSON 备份，不含密钥明文）。

### 智能体/助手预设

- **FR-7**：助手的增删改查：名称、头像标识（emoji 或颜色）、系统提示词、温度/topP/maxTokens、绑定的对话模型。
- **FR-8**：助手可绑定一个知识库（可选），绑定后该助手发起的对话自动走 RAG 流程。
- **FR-9**：提供内置默认助手（通用助手），不可删除；支持排序与快速切换。

### 多会话 AI 对话

- **FR-10**：会话的创建、重命名、删除、列表查询；消息按会话持久化（角色、内容、时间、token 用量、归属助手）。
- **FR-11**：发送消息后通过 SSE 流式返回模型输出，前端逐字渲染 Markdown（含代码高亮）；支持中途停止生成。
- **FR-12**：对话请求携带助手参数（系统提示词、采样参数、模型）与历史消息；后端组装符合 OpenAI 兼容协议的请求。
- **FR-13**：调用供应商失败时返回结构化错误并在 UI 友好提示，不产生残缺的助手消息（或标记为错误状态）。
- **FR-14**：空状态引导：未配置任何可用模型时，对话页引导用户前往设置中心。

### 知识库与 RAG

- **FR-15**：支持创建/删除知识库，上传文本文档（.txt/.md/.markdown，PDF 以纯文本提取为准），展示文档列表与处理状态（待处理/处理中/已索引/失败）。
- **FR-16**：文档导入后自动分片（可配置分片大小与重叠），调用默认 Embedding 模型生成向量，写入 SQLite 本地向量表。
- **FR-17**：RAG 对话时按 top-k 检索相关分片，将片段注入上下文；问答结果可查看引用来源（文档名 + 分片序号）。
- **FR-18**：支持删除文档并级联删除其分片与向量；删除知识库级联清理文档。
- **FR-19**：未配置 Embedding 模型时，文档处理状态明确提示原因，不静默失败。

### 平台与工程

- **FR-20**：统一 API 响应契约（成功数据包络 + 错误结构），入参使用 Zod 校验；前端使用类型安全的 API 客户端。
- **FR-21**：提供 Windows 一键开发启动（Web 与 Desktop 各一条命令）与桌面打包脚本（electron-builder，输出可执行安装包目录）。
- **FR-22**：提供 README（说明文档）、架构设计文档、接口文档、模块设计文档、开发与测试指南。

## Non-Functional Requirements

- **NFR-1 模块化**：monorepo 内按 apps / packages 分层，高内聚低耦合；共享逻辑下沉到 packages，apps 只做装配与页面。
- **NFR-2 文件规模**：除配置/类型声明/自动生成文件外，手写源文件（.ts/.tsx）不超过 300 行；超出必须拆分为子组件或纯函数模块，并提供行数校验脚本。
- **NFR-3 可测试性**：核心包（config/database/ai/core 业务逻辑）单元测试覆盖率（statements）≥ 70%；API 路由提供基于测试数据库的集成测试；E2E 覆盖「配置模型 → 新建对话 → 流式收发 → 知识库问答」关键路径（外部模型调用全部 mock）。
- **NFR-4 可靠性**：外部请求具备超时（默认 30s，SSE 除外）、指数退避重试（仅幂等/连接类错误）与统一错误码；数据库写操作使用事务；SSE 连接中断后服务端正确释放上游连接。
- **NFR-5 安全与隐私**：服务默认仅绑定 127.0.0.1；Electron 生产环境服务端口随机且启动令牌校验；密钥加密落盘；禁止渲染进程直接访问供应商 API；contextIsolation 开启、nodeIntegration 关闭。
- **NFR-6 一致性**：TypeScript strict 模式全量通过；ESLint + Prettier 统一规范；版本号/路径以唯一事实源管理。
- **NFR-7 可维护性**：UI 中文为主；组件库采用 shadcn/ui 风格（Radix + Tailwind，源码内化而非运行时 UI 库黑盒）；状态管理轻量（服务端状态 React Query / SWR 模式封装，局部状态 React 原生）。
- **NFR-8 性能**：知识库 100 篇短文（< 5000 字/篇）量级下，检索响应 P95 < 300ms；首屏可交互时间 < 3s（本机桌面环境）。

## Constraints

- **Technical**：
  - Node.js ≥ 20 LTS；包管理器 pnpm（workspaces）；任务编排 Turborepo。
  - Next.js 14（App Router、Route Handlers、standalone 输出）+ React 18 + TypeScript 5。
  - Electron（最新稳定大版本）+ electron-builder；better-sqlite3 + sqlite-vec；Vitest（单测/集成）+ Playwright（E2E，含 Web 关键路径，Electron 冒烟）。
  - UI：Tailwind CSS + Radix（shadcn/ui 内化组件）；Markdown 渲染 react-markdown + remark-gfm + 代码高亮。
- **Business**：单用户本地免费软件；不依赖任何必须在线的平台侧服务（除用户自配的模型供应商外）。
- **Dependencies**：模型能力依赖用户自配的 OpenAI 兼容供应商（含其 Embedding 接口）；PDF 解析依赖本地 JS 库，无需外部二进制。

## Assumptions

- 开发机已安装 Node.js 20+ 与 pnpm 9；Windows 环境使用 PowerShell。
- 用户自有的供应商 API Key 可用，且供应商同时提供 chat/completions 与 embeddings（RAG 场景）。
- Electron 生产模式采用「主进程 fork Next standalone server（127.0.0.1 随机端口 + 启动令牌）→ 等待端口就绪 → 创建窗口」方案；native 模块 better-sqlite3 运行在被 fork 的 Node 进程内，规避 ABI 重编译问题。
- 桌面安装包本期只要求在本机 Windows 产出目录/NSIS 安装包并完成冒烟，不做代码签名。

## Acceptance Criteria

### AC-1：Monorepo 骨架可安装可构建（rule）

- **Given**：全新克隆的仓库与 Node 20+/pnpm 9 环境
- **When**：执行 `pnpm install` 与 `pnpm build`
- **Then**：所有 workspace 依赖安装成功，Turborepo 编排下各包与应用构建零错误
- **Pass Condition**：两条命令退出码均为 0，apps/web 产出 `.next/standalone`
- **Evidence**：命令输出与产物目录截图/日志

### AC-2：单文件 300 行约束（rule）

- **Given**：全部手写源码
- **When**：执行行数校验脚本（统计 apps/ 与 packages/ 下 .ts/.tsx，排除配置/类型 barrel/生成文件白名单）
- **Then**：无超过 300 行的文件，或超限文件全部在白名单并有注释说明
- **Pass Condition**：脚本退出码 0
- **Evidence**：`pnpm check:lines` 输出

### AC-3：Windows 一键启动（rule）

- **Given**：依赖安装完成
- **When**：执行 `pnpm dev:web` / `pnpm dev:desktop`
- **Then**：Web 模式浏览器可访问全部页面；Desktop 模式自动拉起 Next 服务并打开 Electron 窗口显示同一应用
- **Pass Condition**：两种模式下首页均正常加载，无控制台致命错误
- **Evidence**：运行日志与窗口/浏览器截图

### AC-4：供应商配置与连接测试（rule）

- **Given**：用户在设置页填写一个 mock/真实 OpenAI 兼容供应商
- **When**：保存配置并点击连接测试
- **Then**：配置加密落库；列表/详情接口不返回明文 Key（仅脱敏显示）；连接测试返回归一化成功或结构化失败原因
- **Pass Condition**：集成测试覆盖 CRUD + 脱敏断言 + 测试接口成功/失败两条路径，且全部通过
- **Evidence**：测试报告与接口响应样例

### AC-5：助手预设管理（rule）

- **Given**：已配置至少一个对话模型
- **When**：创建/编辑/删除助手并绑定参数与知识库
- **Then**：助手列表正确反映变更；默认助手不可删除；对话发起时使用该助手的系统提示词与采样参数
- **Pass Condition**：助手 CRUD 集成测试通过；对话请求组装单测断言参数生效
- **Evidence**：测试报告

### AC-6：流式对话闭环（rule）

- **Given**：已配置默认对话模型（测试中使用 mock 供应商返回 SSE 分块）
- **When**：新建会话发送消息并在中途点击停止
- **Then**：消息持久化；页面按 SSE 分块增量渲染 Markdown/代码块；停止后上游连接被释放；刷新历史后消息完整可查；供应商错误返回结构化错误并在 UI 友好展示
- **Pass Condition**：API 集成测试（流式内容拼接、停止、错误分支）与 E2E 流式收发用例通过
- **Evidence**：测试报告、E2E 录屏/追踪

### AC-7：知识库 RAG 问答（rule）

- **Given**：已配置 Embedding 模型（测试中 mock 向量），存在含已知内容的测试文档
- **When**：上传文档 → 系统分片向量化 → 用绑定知识库的助手提问
- **Then**：文档状态流转到「已索引」；检索返回相关分片；回答中可查看引用来源；删除文档后其分片/向量级联删除
- **Pass Condition**：导入处理流水线与检索的集成测试通过；E2E 知识库问答路径通过
- **Evidence**：测试报告、数据库查询记录

### AC-8：Electron 桌面交付（rule）

- **Given**：执行桌面打包脚本
- **When**：安装/启动产物
- **Then**：应用窗口可用，四大模块在桌面端功能与 Web 一致；服务仅监听 127.0.0.1 随机端口且无令牌外部请求被拒绝
- **Pass Condition**：打包成功且 Playwright Electron 冒烟用例（启动→窗口标题→首页渲染）通过
- **Evidence**：打包日志、冒烟测试结果

### AC-9：测试体系完整性（rule）

- **Given**：完整代码库
- **When**：执行 `pnpm test`（单元+集成）与 `pnpm test:e2e`
- **Then**：核心包覆盖率 statements ≥ 70%；关键路径 E2E 全部通过；外部模型调用在测试中 100% mock
- **Pass Condition**：覆盖率报告达标，测试退出码 0
- **Evidence**：Vitest/Playwright 报告

### AC-10：文档齐备（rule）

- **Given**：项目交付
- **When**：审阅仓库文档
- **Then**：存在 README（快速开始/脚本说明）、架构设计文档、接口文档（覆盖全部路由的方法/入参/出参/错误码）、模块设计文档、开发测试指南，且内容与实际代码一致
- **Pass Condition**：5 类文档均存在且通过抽查一致性（命令、路径、接口字段）
- **Evidence**：docs 目录与 README

### AC-11：模块化与可维护性质量（rubric）

- **Type**: `rubric`
- **Dimension**：模块边界清晰度、组件拆分合理性、命名一致性、纯函数可测性
- **Scale**: 1-5
- **Anchors**: 1 = 逻辑大量堆在页面/路由文件、跨层直接依赖；3 = 主要模块分层正确但仍有明显耦合或超长组件；5 = 页面仅装配、逻辑下沉服务/函数、组件单一职责、跨包依赖方向清晰无环
- **Pass Threshold**: ≥ 4
- **Evidence**: 代码走查记录、目录依赖关系、行数校验结果

### AC-12：安全基线（rule）

- **Given**：生产构建产物
- **When**：检查网络监听、密钥存储与 Electron 配置
- **Then**：仅监听 127.0.0.1；密钥不明文落盘、不明文出参；contextIsolation=true、nodeIntegration=false；无令牌请求被拒绝
- **Pass Condition**：安全检查单测/集成测试全部通过
- **Evidence**：测试报告与配置审查记录

## Open Questions

- 无阻断性开放问题（关键架构决策已于 Specify 阶段由用户确认）。
- 次要事项（如 PDF 解析库最终选型、代码高亮主题、NSIS 安装包细节）在对应任务实现时按约束确定并在架构文档中记录。
