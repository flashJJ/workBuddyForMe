# WorkBuddy For Me 架构设计文档

> 版本：1.0.0 ｜ 状态：定稿（Task 38 已与实现逐项核对）
> 配套：[接口文档](./api.md) ｜ [开发指南](./development.md) ｜ [模块设计](./modules/)

## 1. 总体分层架构

WBFM 采用 pnpm + Turborepo monorepo，分三层：**应用层 → 业务层 → 基础设施层**。

```text
┌──────────────────────────────────────────────────────────────┐
│ 应用层                                                        │
│ apps/web    Next.js 14（App Router 页面 + Route Handlers）    │
│ apps/desktop Electron 主进程 / preload / 服务托管 / 打包       │
├──────────────────────────────────────────────────────────────┤
│ 业务层 packages/core                                          │
│ providers / assistants / conversations / chat / knowledge /  │
│ rag / settings / secrets（纯函数式服务，依赖注入数据访问器）    │
├──────────────────────────────────────────────────────────────┤
│ 基础设施层                                                    │
│ packages/ai        Provider 抽象、OpenAI 兼容适配器、HTTP 底座 │
│ packages/database  better-sqlite3、migration、repositories    │
│ packages/config    数据根/环境变量/目录解析（唯一事实源）       │
│ packages/shared    Zod schema、领域类型、错误码、SSE 事件      │
└──────────────────────────────────────────────────────────────┘
```

**依赖方向（无环）**：

```text
web ──→ core ──→ ai ──→ shared
 │       │        │
 │       ├─→ database ──→ config ──→ shared
 │       └─→ config
desktop ──→ config（仅路径/环境契约）
```

禁止反向依赖：shared/config 不引用任何上层包；页面组件不直接 import database/ai，必须经 Route Handler → core。

## 2. 进程模型

### 2.1 Web 模式

```text
浏览器 ──HTTP 127.0.0.1:3000──▶ next dev / next start
                                  └─ Route Handler ─▶ core ─▶ SQLite / 供应商 API
```

开发态 `pnpm dev:web`；生产 Web 可直接 `next start`（本地单用户，默认仅绑定 127.0.0.1）。

### 2.2 Electron 桌面模式（生产）

```text
electron.exe
├─ 主进程（apps/desktop）
│   ├─ safeStorage 可用性检查（不可用即退出）
│   ├─ 启动本地一次性 cipher 桥（safeStorage 加解密 HTTP 服务，随机 token 鉴权）
│   ├─ 生成随机 PORT 与 WBFM_TOKEN
│   ├─ fork .next/standalone/apps/web/server.js（NODE_ENV=production）
│   │        execPath = resources/server/node/node.exe（内置真实 Node 运行时）
│   │        env 注入：PORT / HOSTNAME=127.0.0.1 / WBFM_TOKEN / WBFM_DATA_ROOT /
│   │                  WBFM_SERVER_MANAGED=1；--require 注入 cipher 引导脚本
│   ├─ 轮询 GET /api/health（带 X-WBFM-Token，30s 超时）直至就绪
│   └─ BrowserWindow（contextIsolation:true, nodeIntegration:false, sandbox:true）
│        加载托管 URL；令牌经 preload 暴露 window.wbfm { token, baseUrl, isManaged }
└─ 被 fork 的 Node 进程（内置真实 Node，ABI 与 node_modules 一致）
    └─ Next standalone server ─▶ core ─▶ better-sqlite3 / sqlite-vec
```

关键决策：Electron `fork` 默认以 Electron 内建 Node（ABI 125）运行子进程，与 Node 24 编译的 better-sqlite3（ABI 137）`NODE_MODULE_VERSION` 不匹配会 dlopen 失败。打包时 `prepare-server.mjs` 把构建同版本真实 Node 复制进 `resources/server/node/`，fork 显式 `execPath`——better-sqlite3 运行在与编译环境一致的真实 Node 上，**无需 electron-rebuild**；主进程退出时先 SIGTERM 后 SIGKILL 子进程回收端口。

## 3. 目录约定

```text
apps/web/src/
  app/                 路由（页面）与 app/api/**（Route Handlers）
  components/ui/       内化的 shadcn 风格基础组件
  components/<domain>/ 领域组件（layout/chat/knowledge/...）
  features/            客户端领域逻辑（hooks、api 调用、状态）
  lib/                 通用前端工具（cn、SSE 解析、markdown）
packages/<pkg>/src/
  index.ts             包出口（barrel）
  <module>/*.ts        单一职责模块，文件 ≤ 300 行
```

包导出约定：`development` 条件指向 `src/index.ts`（Next dev / Vitest 直接消费 TS 源码）；生产条件指向 tsup 产物 `dist/index.mjs|cjs`。

## 4. 核心数据流

### 4.1 流式对话

```text
用户发送消息
  POST /api/chat/stream（SSE）
   1. 校验 → 读取 assistant → 读取历史消息
   2. [可选] RAG：query embedding → sqlite-vec top-k → 组装引用上下文
   3. 调用 ai 包 chatStream（OpenAI 兼容 /chat/completions, stream:true）
   4. 异步迭代上游 chunk → 转发 SSE 事件：event:delta / done / error
   5. done：落库 assistant 消息（content + usage + citations）
      error：消息落 status=error，持久化 errorCode/errorMessage
      客户端停止：abort 时已生成内容写回，消息落 status=stopped
   客户端断开：request.signal → AbortController.abort() → 上游连接释放
```

SSE 事件协议：`data:` 行承载 JSON，`event` 类型见 `shared` 的 `SseEvent` 联合（`meta`、`delta`、`citations`、`done`、`error`）。

### 4.2 知识库导入流水线

```text
上传（multipart）→ documents 落 status=pending
后台任务（不阻塞响应）：
  processing → 解析文本（txt/md 直读；pdf 本地 JS 提取）
  → 分片器（chunk_size / overlap，按段落友好切分）
  → embedder 批量调用（默认 embedding 模型）
  → 事务写 document_chunks + chunks_vec
  → indexed（chunk_count 回写）
  任一失败 → failed + error_message（如「未配置 Embedding 模型」）
```

## 5. 数据模型（ER）

```text
providers 1───* models
  providers(id, name, protocol, base_url, api_key_cipher, enabled, sort_order, timestamps)
  models(id, provider_id FK, model_id, display_name, capabilities(json), context_window, created_at)

assistants *───1 models（绑定对话模型, 可空→跟随默认）
assistants *───0..1 knowledge_bases
  assistants(id, name, emoji, color, system_prompt, temperature, top_p,
             max_tokens, model_id FK?, knowledge_base_id FK?, is_builtin, sort_order, timestamps)

conversations *──1 assistants ; conversations 1──* messages
  conversations(id, assistant_id FK, title, last_message_at, timestamps)
  messages(id, conversation_id FK, role, content, status,
           prompt_tokens, completion_tokens, total_tokens,
           citations(json), error_code, error_message, created_at)

knowledge_bases 1──* documents 1──* document_chunks 1──1 chunks_vec
  knowledge_bases(id, name, description, chunk_size, chunk_overlap, timestamps)
  documents(id, knowledge_base_id FK, filename, file_type, byte_size, content_hash,
            status, error_message, chunk_count, created_at, indexed_at)
  document_chunks(id PK INTEGER, document_id FK, ordinal, content, char_start, char_end, created_at)
  chunks_vec(rowid INTEGER 1:1=document_chunks.id, embedding float[dim])  -- sqlite-vec vec0
settings_kv(key PK, value(json), updated_at)
```

删除策略：知识库/会话/供应商删除走外键 `ON DELETE CASCADE` 或仓储显式事务级联；向量表通过 chunk id 同步删除。

## 6. API 契约与错误模型

- 成功：`{ "success": true, "data": T }`；失败：`{ "success": false, "error": { "code", "message", "details?" } }`。
- 入参全部经 Zod 校验（body/query/params）；失败统一 422。
- Electron 模式额外校验请求头 `X-WBFM-Token`，缺失/不匹配 → 401。
- 错误码表（以 `@wbfm/shared` 为唯一事实源）：

| code | HTTP | 语义 |
|---|---|---|
| VALIDATION_ERROR | 422 | 入参校验失败 |
| UNAUTHORIZED | 401 | 缺少/错误的本地启动令牌 |
| FORBIDDEN | 403 | 禁止操作（如删除内置助手） |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 状态冲突（如同名同内容文档重复上传） |
| EMBEDDING_NOT_CONFIGURED | 422 | 知识库操作缺少 Embedding 模型 |
| UNSUPPORTED_PROVIDER | 501 | 协议适配器未启用（Ollama 预留） |
| PROVIDER_ERROR | 502 | 上游供应商返回错误 |
| PROVIDER_TIMEOUT | 504 | 上游超时/连接失败（重试耗尽） |
| INTERNAL_ERROR | 500 | 未预期错误（兜底） |

完整路由清单见 [api.md](./api.md)。

## 7. 安全与隐私

- 网络：所有监听默认 `127.0.0.1`；桌面端口随机 + 启动令牌；无令牌请求被拒。
- 密钥：`api_key_cipher` 落盘为密文，任何接口只返回脱敏串（`maskSecret`：保留前 3 位与后 4 位，中间 `****`）。
  - Electron：主进程 `safeStorage` 加解密，经本地一次性 cipher 桥（HTTP + `--require` 引导脚本）供服务端内存解密。
  - Web：AES-256-GCM，密钥文件位于数据根 `keys/`（0600 权限尝试设置）。
- Electron：contextIsolation 开启、nodeIntegration 关闭、sandbox 优先；preload 仅暴露最小白名单 API。
- 前端永不直连供应商；所有出站请求由 ai 包统一发出（认证头注入、超时、退避）。

## 8. 关键架构决策（ADR）

| ID | 决策 | 理由 |
|---|---|---|
| ADR-0001 | Next.js 全栈，Electron fork standalone server | 一套代码双端；native 模块规避 Electron ABI 重编译 |
| ADR-0002 | pnpm `nodeLinker: hoisted` | Windows 非提权下 Next standalone 符号链接 EPERM；兼容 electron-builder |
| ADR-0003 | SQLite + sqlite-vec（vec0 虚表） | 单机免部署、易备份；100 篇文档量级 P95 检索 <300ms |
| ADR-0004 | 密钥双实现：safeStorage / AES-256-GCM | 桌面用 OS 能力，Web 保持同等加密强度 |
| ADR-0005 | 包导出 development→源码 / 生产→dist | dev 免 watch 构建；生产可追踪、可打包 |
| ADR-0006 | 127.0.0.1 随机端口 + X-WBFM-Token | 防止本机其他进程/网页跨进程调用本地服务 |
| ADR-0007 | 统一响应包络 + Zod 端到端校验 | 前后端类型同源，错误可预期 |
| ADR-0008 | 手写 TS/TSX ≤300 行硬门禁 | 强制组件/函数拆分，保可维护性（脚本 CI 阻断） |

## 9. 测试策略

- **单元**：Vitest，packages 的纯函数/仓储/适配器（fetch 全部 mock）；statements ≥70%。
- **集成**：独立临时数据根 + 真实 SQLite + mock Provider，驱动 Route Handler 全部分支（含 SSE）。
- **E2E**：Playwright（Web 关键路径 5 场景，测试开关注入 mock Provider）；Playwright Electron 冒烟 + 安全断言。
- 测试数据隔离：每个用例独立临时数据根（`setDataRootForTest`），禁止依赖用户真实数据目录。
