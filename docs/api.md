# 接口文档

> 与 `apps/web/src/app/api/**/route.ts` 一一对应（19 个路由文件，全部已实现）。
> 入参校验事实源：`packages/shared/src/schemas/*`；错误码事实源：`packages/shared/src/errors/error-codes.ts`。
> Base URL：`http://127.0.0.1:3000/api`（Web 开发态）；Electron 生产模式为随机回环端口，由 preload 注入 `window.wbfm.baseUrl`。

## 1. 通用约定

### 1.1 鉴权（托管模式）

Electron 托管模式下所有请求必须携带令牌请求头（大小写不敏感）：

```text
x-wbfm-token: <启动时生成的随机令牌>
```

- 缺失/错误 → `401 UNAUTHORIZED`。
- Web 独立运行（`WBFM_SERVER_MANAGED` 未启用）时不校验。
- 仅绑定 `127.0.0.1`，外部地址无法访问。

### 1.2 响应包络

成功（HTTP 2xx）：

```json
{ "success": true, "data": { } }
```

失败（HTTP 4xx/5xx）：

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "可读原因", "details": {} } }
```

### 1.3 错误码矩阵

| code | HTTP | 典型场景 |
|---|---|---|
| VALIDATION_ERROR | 422 | Zod 校验失败（必填缺失、超长、格式错误） |
| UNAUTHORIZED | 401 | 托管模式令牌缺失或不匹配 |
| FORBIDDEN | 403 | 禁止操作（如删除内置助手） |
| NOT_FOUND | 404 | 资源不存在（供应商/模型/助手/会话/消息/文档） |
| CONFLICT | 409 | 业务冲突（同名同内容文档重复上传） |
| EMBEDDING_NOT_CONFIGURED | 422 | 知识库摄入/检索时系统未配置 embedding 模型 |
| UNSUPPORTED_PROVIDER | 501 | protocol 暂不支持（如 ollama 适配器未接入） |
| PROVIDER_ERROR | 502 | 上游模型服务返回 5xx / 重试耗尽 / SSE 通道非 2xx |
| PROVIDER_TIMEOUT | 504 | 上游连接或响应超时 |
| INTERNAL_ERROR | 500 | 未归类服务端异常 |

SSE 流中产生的上游错误不中断 HTTP 200，而是以 `error` 事件下发（见 §3），同时落库 `messages.error_code`。

## 2. 路由总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（Electron 就绪探测） |
| GET | `/api/system/info` | 数据目录与版本 |
| GET / POST | `/api/providers` | 供应商列表 / 新建 |
| PATCH / DELETE | `/api/providers/{id}` | 更新 / 删除（级联删除其模型） |
| POST | `/api/providers/{id}/test` | 用已保存凭据测试连通性 |
| GET / POST | `/api/providers/{id}/models` | 模型列表 / 手工新增 |
| DELETE | `/api/models/{id}` | 删除模型 |
| GET / PUT | `/api/settings` | 偏好读取 / 更新 |
| GET / POST | `/api/assistants` | 助手列表 / 新建 |
| PATCH / DELETE | `/api/assistants/{id}` | 更新 / 删除（内置助手 403） |
| POST | `/api/assistants/reorder` | 助手排序 |
| GET / POST | `/api/conversations` | 会话列表 / 新建 |
| GET / PATCH / DELETE | `/api/conversations/{id}` | 详情 / 重命名 / 删除（级联消息） |
| GET | `/api/conversations/{id}/messages` | 消息历史（`?limit=`） |
| POST | `/api/chat/stream` | 流式对话（SSE） |
| GET / POST | `/api/knowledge-bases` | 知识库列表 / 新建 |
| PATCH / DELETE | `/api/knowledge-bases/{id}` | 更新 / 删除（级联文档与分片） |
| GET / POST | `/api/knowledge-bases/{id}/documents` | 文档列表 / 上传（multipart） |
| GET / DELETE | `/api/documents/{id}` | 状态轮询 / 删除 |

除非另行说明：请求体均为 JSON；`{id}` 为路径参数（字符串，非空）；列接口按创建时间/约定排序返回数组。

## 3. SSE 事件协议（POST /api/chat/stream）

响应 `Content-Type: text/event-stream`，每事件格式 `event: <name>\ndata: <json>\n\n`。v0.2 起一次回答可能包含多轮工具调用，事件顺序：

```text
meta → (citations? | tool(start → end) | delta)* → done | error
```

| 事件 | data 载荷 | 说明 |
|---|---|---|
| meta | `{ "messageId": string, "conversationId": string }` | 助手消息已落库（status=streaming） |
| delta | `{ "content": string }` | 增量文本，可能多次（工具轮之间也可能出现） |
| tool | 见下 | 单次工具调用的开始/结束，一轮回答内可能多组、多轮 |
| citations | `{ "citations": Citation[] }` | RAG 或 knowledge_search 工具命中时下发；累积去重，可能多次 |
| done | `{ "content": string, "usage": { promptTokens, completionTokens, totalTokens } \| null }` | 正常结束，usage 来自上游或本地估算 |
| error | `{ "code": string, "message": string }` | 上游失败（如 PROVIDER_ERROR），消息标记 status=error |

`tool` 事件是 `phase` 判别联合：

```jsonc
// start
{ "phase": "start", "callId": "call_abc", "tool": "current_time", "argsSummary": "当前时间" }
// end
{ "phase": "end", "callId": "call_abc", "tool": "current_time",
  "status": "ok" | "error", "durationMs": 42,
  "resultSummary": "2026-…", "error"?: "失败原因（status=error 时）" }
```

`tool ∈ 'current_time' | 'knowledge_search' | 'fetch_webpage'`。工具名仅出现在助手 `enabledTools` 白名单且模型支持 function calling 时才会下发；工具执行失败不中断对话，错误文本会回灌模型让其自我纠正。工具调用最多 `MAX_TOOL_ROUNDS=5` 轮，单次工具超时 15s（fetch_webpage 抓取超时 8s）。

`Citation = { documentId, documentName, ordinal, snippet? }`。最终的工具轨迹随助手消息持久化在 `messages.tool_trace`（`ToolTraceEntry[]`，字段与 end 事件一致并额外含 `startedAt`），历史消息接口直接返回。客户端中断（AbortController）时服务端将助手消息标记为 `stopped`，不再下发事件。

## 4. 接口明细

### 4.1 GET /api/health

- 出参 `data`：`{ "status": "ok", "uptime": 12.34 }`
- 错误：401（托管模式无令牌）

### 4.2 GET /api/system/info

- 出参 `data`：`{ "dataDir": string, "version": string }`

```bash
curl -s http://127.0.0.1:3000/api/system/info
```

### 4.3 GET /api/providers

- 出参 `data`：`Provider[]`

```ts
interface Provider {
  id: string; name: string;
  protocol: 'openai-compatible' | 'ollama';
  baseUrl: string;
  apiKeyMasked: string | null;   // 脱敏，如 sk-****ab12；未配置为 null
  enabled: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}
```

### 4.4 POST /api/providers

- 入参（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string 1–60 | 是 | 名称 |
| protocol | enum | 否（默认 `openai-compatible`） | `openai-compatible` \| `ollama` |
| baseUrl | string URL | 是 | 仅 http/https |
| apiKey | string ≤300 | 否（默认 `''`，本地服务可空） | 保存时经 safeStorage/密钥加密落库 |
| enabled | boolean | 否 | |
| sortOrder | int ≥0 | 否 | |

- 出参 `data`：`Provider`（201）
- 错误：422
- 协议约定（v0.2）：
  - `openai-compatible`：chat/embeddings/模型发现走 `{baseUrl}/chat/completions` 等 OpenAI 路径。
  - `ollama`：本地服务（默认 `http://127.0.0.1:11434`），`apiKey` 忽略；chat/embeddings 复用 OpenAI 兼容 `/v1` 端点（baseUrl 裸地址会自动补 `/v1`），连通性测试与模型列表走 Ollama 原生 `GET /api/tags`。

```bash
curl -s -X POST http://127.0.0.1:3000/api/providers \
  -H 'content-type: application/json' \
  -d '{"name":"本地 Ollama","protocol":"ollama","baseUrl":"http://127.0.0.1:11434","apiKey":""}'
```

### 4.5 PATCH /api/providers/{id}

- 入参：§4.4 字段均可选，但至少一个；`apiKey` 缺省或传空串均视为不修改（保留原 Key）。
- 出参 `data`：`Provider`；错误：404 / 422

### 4.6 DELETE /api/providers/{id}

- 出参 `data`：`{ "id": string }`；级联删除该供应商全部模型。错误：404

### 4.7 POST /api/providers/{id}/test

- 入参：无（使用已保存凭据）。设置页「未保存先测」走 `POST /api/providers` 临时创建后删除即可。
- 出参 `data`：`{ "ok": true }`
- 错误：404 / 501 / 502 / 504

### 4.8 GET /api/providers/{id}/models

- 出参 `data`：`ProviderModel[]`

```ts
interface ProviderModel {
  id: string; providerId: string; modelId: string; displayName: string;
  capabilities: ('chat' | 'embedding')[];
  contextWindow: number | null; createdAt: string;
}
```

### 4.9 POST /api/providers/{id}/models

- 入参（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| modelId | string 1–120 | 是 | 如 `qwen2.5:7b` |
| displayName | string ≤120 | 否 | 缺省等于 modelId |
| capabilities | enum[] ≥1 | 否（默认 `['chat']`） | `chat` \| `embedding` |
| contextWindow | int>0 \| null | 否 | |

- 出参 `data`：`ProviderModel`（201）；错误：404 / 422

### 4.10 DELETE /api/models/{id}

- 出参 `data`：`{ "id": string }`；删除后引用它的默认模型设置与助手绑定自动失效（置 null）。错误：404

### 4.11 GET /api/settings

- 出参 `data`：`AppSettings`

```ts
interface AppSettings {
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  theme: 'light' | 'dark';
  language: 'zh-CN';
}
```

### 4.12 PUT /api/settings

- 入参：§4.11 字段均可选，缺省保留原值。
- 出参 `data`：`AppSettings`（更新后全量）；错误：422

### 4.13 GET /api/assistants

- 出参 `data`：`Assistant[]`（按 sortOrder 升序，含两个内置助手）

```ts
interface Assistant {
  id: string; name: string; emoji: string | null; color: string | null;
  systemPrompt: string; temperature: number; topP: number; maxTokens: number | null;
  modelId: string | null;          // null 跟随系统默认对话模型
  knowledgeBaseId: string | null;  // 非空时允许 knowledge_search / 自动 RAG
  enabledTools: ToolName[];        // 白名单：'current_time' | 'knowledge_search' | 'fetch_webpage'
  retrieveAlways: boolean;         // true=每轮强制 RAG（v0.1 行为）；false=仅模型调用工具时检索
  isBuiltin: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}
```

### 4.14 POST /api/assistants

- 入参（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string 1–60 | 是 | |
| emoji | string ≤8 \| null | 否（默认 null） | |
| color | `#RRGGBB` \| null | 否（默认 null） | |
| systemPrompt | string ≤8000 | 否（默认 `''`） | |
| temperature | 0–2 | 否（默认 1） | |
| topP | 0–1 | 否（默认 1） | |
| maxTokens | int>0 ≤1e6 \| null | 否（默认 null） | |
| modelId | string \| null | 否（默认 null） | 绑定 models.id |
| knowledgeBaseId | string \| null | 否（默认 null） | 允许 knowledge_search / 自动 RAG |
| enabledTools | ToolName[] | 否（默认 `['current_time']`） | 工具白名单；含 `knowledge_search` 时必须同时绑定知识库，否则 422 |
| retrieveAlways | boolean | 否（默认 true） | 绑定知识库时是否每轮强制检索 |
| sortOrder | int ≥0 | 否（默认 0） | |

- 出参 `data`：`Assistant`（201）；错误：404（modelId/knowledgeBaseId 不存在）/ 422

### 4.15 PATCH /api/assistants/{id}

- 入参：§4.14 字段均可选（`sortOrder` 同样可更），至少一个。
- 出参 `data`：`Assistant`；错误：404 / 422

### 4.16 DELETE /api/assistants/{id}

- 内置助手 → `403 FORBIDDEN`；其余删除成功：`{ "id": string }`。错误：404 / 403

### 4.17 POST /api/assistants/reorder

- 入参：`{ "orderedIds": string[] ≥1 }`（完整顺序）
- 出参 `data`：`Assistant[]`（重排后）；错误：422

### 4.18 GET /api/conversations

- 出参 `data`：`Conversation[]`（按 lastMessageAt 降序，空会话在后）

```ts
interface Conversation {
  id: string; assistantId: string; title: string;
  lastMessageAt: string | null; createdAt: string; updatedAt: string;
}
```

### 4.19 POST /api/conversations

- 入参：`{ "assistantId": string, "title"?: string ≤120 }`
- 出参 `data`：`Conversation`（201）；错误：404 / 422

### 4.20 GET /api/conversations/{id}

- 出参 `data`：`Conversation`；错误：404

### 4.21 PATCH /api/conversations/{id}

- 入参：`{ "title": string 1–120 }`
- 出参 `data`：`Conversation`；错误：404 / 422

### 4.22 DELETE /api/conversations/{id}

- 出参 `data`：`{ "id": string }`；级联删除全部消息。错误：404

### 4.23 GET /api/conversations/{id}/messages?limit={n}

- 查询参数：`limit`（正整数，可选，缺省全量，按时间升序）
- 出参 `data`：`Message[]`

```ts
interface Message {
  id: string; conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  status: 'streaming' | 'completed' | 'error' | 'stopped';
  promptTokens: number | null; completionTokens: number | null; totalTokens: number | null;
  citations: Citation[];
  toolTrace: ToolTraceEntry[];   // v0.2：该助手回复触发的工具调用轨迹
  errorCode: string | null; errorMessage: string | null;
  createdAt: string;
}
```

- 错误：404（会话不存在）

### 4.24 POST /api/chat/stream（SSE）

- 入参（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 否 | 缺省时新建会话（meta 事件返回 id）；`regenerate=true` 时必填 |
| assistantId | string | 是 | |
| content | string 1–100000 | 是 | 用户消息；`regenerate=true` 时忽略，沿用上一条用户消息 |
| regenerate | boolean | 否（默认 false） | 重新生成：删除该会话尾部最后一条助手消息后重新作答，不新增用户消息 |

- 成功：HTTP 200 `text/event-stream`（事件协议见 §3）
- 校验/存在性错误在建立 SSE 前返回统一 JSON：404 / 422
- 流中上游错误 → `error` 事件（HTTP 仍 200）

```bash
curl -N -X POST http://127.0.0.1:3000/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"assistantId":"<id>","content":"介绍一下这个项目"}'
```

### 4.25 GET /api/knowledge-bases

- 出参 `data`：`KnowledgeBase[]`

```ts
interface KnowledgeBase {
  id: string; name: string; description: string;
  chunkSize: number; chunkOverlap: number;
  documentCount: number; createdAt: string; updatedAt: string;
}
```

### 4.26 POST /api/knowledge-bases

- 入参（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string 1–60 | 是 | |
| description | string ≤500 | 否（默认 `''`） | |
| chunkSize | int 100–4000 | 否（默认 500） | 分片长度 |
| chunkOverlap | int 0–500 | 否（默认 80） | 分片重叠 |

- 出参 `data`：`KnowledgeBase`（201）；错误：422

### 4.27 PATCH /api/knowledge-bases/{id}

- 入参：§4.26 字段均可选，至少一个；修改 chunkSize/chunkOverlap 不重切已索引文档。
- 出参 `data`：`KnowledgeBase`；错误：404 / 422

### 4.28 DELETE /api/knowledge-bases/{id}

- 出参 `data`：`{ "id": string }`；级联删除文档、分片与向量。错误：404

### 4.29 GET /api/knowledge-bases/{id}/documents

- 出参 `data`：`DocumentRecord[]`

```ts
interface DocumentRecord {
  id: string; knowledgeBaseId: string; filename: string; fileType: string;
  byteSize: number; contentHash: string;
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  errorMessage: string | null; chunkCount: number;
  createdAt: string; indexedAt: string | null;
}
```

- 错误：404（知识库不存在）

### 4.30 POST /api/knowledge-bases/{id}/documents（multipart）

- 入参：`multipart/form-data`，文件字段名 `file`；≤10 MB；扩展名限 `.txt` `.md` `.markdown` `.pdf`；同名同内容重复上传 → 409
- 行为：登记元数据（`pending`）后立即后台摄入（切分 → embedding → 向量入库），返回 201
- 出参 `data`：`DocumentRecord`（status=pending）
- 错误：404 / 409 / 422（超限/类型不支持/缺文件字段）

```bash
curl -s -X POST http://127.0.0.1:3000/api/knowledge-bases/<kbId>/documents \
  -F "file=@./产品介绍.md;type=text/markdown"
```

### 4.31 GET /api/documents/{id}

- 出参 `data`：`DocumentRecord`；上传后轮询 `processing → indexed | failed` 用。错误：404

### 4.32 DELETE /api/documents/{id}

- 出参 `data`：`{ "id": string }`；级联删除分片与向量。错误：404
