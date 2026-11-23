# v4.25 契约：会来事

> 冻结项：触发器类型、数据表、运行入参、Webhook HTTP 面、管理 API、错误码与上限。
> 变更需在 spec 中登记并同步本文件。

## 1. 类型与枚举

```ts
// packages/shared/src/types/flow.ts
export const FLOW_TRIGGERS = [
  'manual', 'chat', 'api', 'mcp', 'schedule', 'webhook', 'file',
] as const;
export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

export type FlowTriggerKind = 'webhook' | 'file';
export type FlowTriggerLastStatus = 'created' | 'skipped_busy' | 'error' | 'disabled';

export interface FlowFileTriggerConfig {
  /** 绝对目录路径 */
  path: string;
  /** 小写、无点，如 ['md','txt'] */
  extensions: string[];
  /** 缺省 true */
  recursive?: boolean;
}

export interface FlowTriggerView {
  id: string;
  workflowId: string;
  kind: FlowTriggerKind;
  name: string;
  enabled: boolean;
  config: FlowFileTriggerConfig | null;
  /** Webhook 展示用；secret 本身永不返回 */
  webhookPath: string | null;
  lastFiredAt: string | null;
  lastRunId: string | null;
  lastStatus: FlowTriggerLastStatus | null;
  createdAt: string;
  updatedAt: string;
}
```

## 2. 创建 / 更新输入

```ts
// packages/shared/src/schemas/flow/trigger.ts
export const flowTriggerCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('webhook'),
    name: z.string().trim().max(80).optional(),
  }),
  z.object({
    kind: z.literal('file'),
    name: z.string().trim().max(80).optional(),
    config: flowFileTriggerConfigSchema,
  }),
]);

export const flowTriggerUpdateSchema = z.object({
  name: z.string().trim().max(80).optional(),
  enabled: z.boolean().optional(),
  config: flowFileTriggerConfigSchema.optional(),
}).refine((v) => Object.keys(v).length > 0, '至少提供一个字段');

export const flowFileTriggerConfigSchema = z.object({
  path: z.string().min(1).max(1024),
  extensions: z.array(
    z.string().regex(/^[a-z0-9]{1,16}$/, '扩展名需为小写字母或数字'),
  ).min(1).max(20),
  recursive: z.boolean().optional(),
});
```

## 3. 运行入参

### 3.1 Webhook

请求 body 必须是 JSON 对象；顶层字段合并进 Flow 入参，保留键不可被覆盖：

```ts
interface WebhookRunInput {
  [bodyKey: string]: unknown;
  /** 原始 body，始终保留 */
  payload: Record<string, unknown>;
  source: 'webhook';
  triggerId: string;
  receivedAt: string; // ISO
}
```

示例：body `{"topic":"周报","count":3}` →

```json
{
  "topic": "周报",
  "count": 3,
  "payload": { "topic": "周报", "count": 3 },
  "source": "webhook",
  "triggerId": "tr_xxx",
  "receivedAt": "2026-11-23T09:00:00.000Z"
}
```

### 3.2 文件

```ts
interface FileRunInput {
  path: string;       // 绝对路径
  name: string;       // 文件名
  ext: string;        // 小写无点
  eventType: 'add' | 'change';
  changedAt: string;  // ISO
  source: 'file';
  triggerId: string;
  file: {
    path: string;
    name: string;
    ext: string;
    eventType: 'add' | 'change';
    changedAt: string;
  };
}
```

## 4. Webhook HTTP 契约

- 方法：`POST`
- 路径：`/api/public/flows/triggers/:triggerId`
- Header：
  - `Authorization: Bearer <secret>`（必填）
  - `Content-Type: application/json`（必填）
  - `Idempotency-Key: <1–128 chars>`（可选）
- Host：仅 `127.0.0.1` / `localhost`（含端口）
- Body 上限：256KB；超限 413
- 限流：每触发器 30 次/分钟

成功：

```json
// 202
{ "success": true, "data": { "runId": "run_xxx" } }

// 200（幂等命中）
{ "success": true, "data": { "duplicate": true } }
```

失败包络：

```json
{ "success": false, "error": { "code": "flow_busy", "message": "流程有在途运行" } }
```

| HTTP | code | 场景 |
|---|---|---|
| 401 | unauthorized | 缺失/错误 Secret |
| 403 | invalid_host | 非回环 Host |
| 404 | not_found | 触发器不存在或已禁用 |
| 409 | flow_busy | 同流程有 queued/running/waiting_human |
| 413 | payload_too_large | body 超过 256KB |
| 415 | unsupported_media_type | 非 JSON |
| 422 | validation_failed | body 非对象 / 触发器指向未发布流程 |
| 429 | rate_limited | 超过 30 次/分钟（带 `retry-after`） |
| 500 | internal_error | 未预期错误（不泄露内部细节） |

## 5. 管理 API

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/api/flows/:id/triggers` | — | `{ triggers: FlowTriggerView[] }` |
| POST | `/api/flows/:id/triggers` | `flowTriggerCreateSchema` | `{ trigger, secret? }` |
| PATCH | `/api/flows/:id/triggers/:triggerId` | `flowTriggerUpdateSchema` | `{ trigger }` |
| DELETE | `/api/flows/:id/triggers/:triggerId` | — | `{ removed: boolean }` |

约束：

- 流程必须存在；创建/启用要求已发布且存在生产版本；
- 每流程最多 10 条；Webhook ≤5；文件 ≤5；
- `secret` 仅在 Webhook 创建响应出现一次；
- 增删改成功后触发 watcher `reconcile()`（失败只降级为下次启动重建）。

## 6. 数据库契约（v055）

```sql
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL,
  secret_hash TEXT,
  last_fired_at TEXT,
  last_run_id TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow
  ON workflow_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_kind
  ON workflow_triggers(kind, enabled);
```

- `LATEST_SCHEMA_VERSION = 55`；
- 迁移纯加法，无回填；
- 所有 `migrations/*.test.ts` 的版本断言同步到 55。

## 7. 服务方法与结果

```ts
type FireResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'busy' | 'not_published' | 'duplicate' | 'disabled' };

interface FlowTriggerService {
  list(workflowId: string): FlowTriggerView[];
  create(workflowId: string, input: FlowTriggerCreateInput):
    { trigger: FlowTriggerView; secret?: string };
  update(workflowId: string, triggerId: string, patch: FlowTriggerUpdateInput): FlowTriggerView;
  remove(workflowId: string, triggerId: string): boolean;

  authenticateWebhook(triggerId: string, authorization: string | null): FlowTriggerView;

  fireWebhook(
    trigger: FlowTriggerView,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): FireResult;

  fireFile(trigger: FlowTriggerView, file: FileTriggerEvent): FireResult;
}
```

## 8. 监听器契约

```ts
interface FileWatchAdapter {
  watch(
    path: string,
    options: { recursive: boolean },
    listener: (eventType: 'rename' | 'change', filename: string | null) => void,
  ): { close(): void };
  stat(path: string): { isDirectory(): boolean } | null;
}

interface FileTriggerEvent {
  path: string;
  name: string;
  ext: string;
  eventType: 'add' | 'change';
  changedAt: string;
}
```

## 9. 常量与上限

| 常量 | 值 | 位置 |
|---|---|---|
| 每流程触发器上限 | 10 | core trigger-service |
| Webhook 触发器上限 | 5 | 同上 |
| 文件触发器上限 | 5 | 同上 |
| Webhook body 上限 | 256KB | 公开路由 |
| Webhook 限流 | 30 次/分钟/触发器 | 公开路由 |
| 幂等 TTL | 10 分钟 | trigger-service |
| 幂等条目上限 | 500/触发器 | trigger-service |
| 文件防抖 | 800ms | file-watcher |
| 同路径重复窗口 | 2s | file-watcher |
| 扩展名上限 | 20 | shared schema |
| Secret 前缀/长度 | `wft_` + 32 bytes base64url | trigger-auth |

## 10. 鉴权与安全

- Secret 比较：SHA-256 + `timingSafeEqual`，长度不一致直接失败；
- Secret 不进入运行入参、事件、日志与错误消息；
- 公开路由不读写会话、不接受托管 token/cookie；
- `webhook/file` 运行一律 `interactive=false` + `unattendedPolicy={mode:'deny_all'}`；
- 文件路径必须是绝对路径且存在；相对路径、盘符根目录（如 `C:\`）拒绝；
- 监听器不跟随符号链接目录（`fs.watch` 默认不跟随）。
