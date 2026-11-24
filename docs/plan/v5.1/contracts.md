# v5.1 契约：会设防

> 状态：📐 M0 草案（待评审）
> 关联：[选题](./README.md) · [规格](./spec.md) · [任务](./tasks.md)
> 约定：类型与 schema 放 `@wbfm/shared`，核心逻辑放 `@wbfm/core`，仓储放 `@wbfm/database`。

## 1. 常量

新增 `packages/shared/src/constants/tools.ts` 的 v5.1 区块：

| 常量 | 值 | 用途 |
|---|---|---|
| `WORKSPACE_ROOTS_MAX` | 8 | 用户可追加授权根上限 |
| `FILE_SNAPSHOT_MAX_BYTES` | 20 MiB | 单文件内容快照上限 |
| `FILE_SNAPSHOT_QUOTA_BYTES` | 512 MiB | 快照库总配额 |
| `FILE_SNAPSHOT_RETENTION_DAYS` | 30 | 快照保留天数 |
| `FILE_ROLLBACK_PATHS_MAX` | 200 | 一次回滚最多文件数 |
| `FILE_SNAPSHOT_CLEANUP_BATCH` | 200 | 清理批大小 |

## 2. 类型与 schema

新增 `packages/shared/src/schemas/flow/file-guard.ts`：

```ts
export const FILE_SNAPSHOT_ACTIONS = [
  'write_overwrite',
  'write_new',
  'delete',
  'move',
] as const;
export type FileSnapshotAction = (typeof FILE_SNAPSHOT_ACTIONS)[number];

export const FILE_SNAPSHOT_TRUNCATION_REASONS = [
  'too_large',
  'snapshots_disabled',
] as const;
export type FileSnapshotTruncationReason =
  (typeof FILE_SNAPSHOT_TRUNCATION_REASONS)[number];

export const ROLLBACK_ENTRY_STATUSES = [
  'restored',
  'deleted',
  'skipped',
  'conflict',
  'failed',
] as const;
export type RollbackEntryStatus = (typeof ROLLBACK_ENTRY_STATUSES)[number];

export const fileSnapshotViewSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeId: z.string().nullable(),
  toolName: z.string(),
  action: z.enum(FILE_SNAPSHOT_ACTIONS),
  path: z.string(),
  targetPath: z.string().nullable(),
  existedBefore: z.boolean(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
  truncated: z.boolean(),
  truncationReason: z.enum(FILE_SNAPSHOT_TRUNCATION_REASONS).nullable(),
  createdAt: z.string(),
});
export type FileSnapshotView = z.infer<typeof fileSnapshotViewSchema>;

export const rollbackRequestSchema = z.object({
  dryRun: z.boolean().default(true),
  nodeId: z.string().optional(),
  paths: z.array(z.string()).max(FILE_ROLLBACK_PATHS_MAX).optional(),
  force: z.array(z.string()).max(FILE_ROLLBACK_PATHS_MAX).optional(),
});
export type RollbackRequest = z.infer<typeof rollbackRequestSchema>;

export const rollbackEntryResultSchema = z.object({
  path: z.string(),
  action: z.enum(FILE_SNAPSHOT_ACTIONS),
  status: z.enum(ROLLBACK_ENTRY_STATUSES),
  reason: z.enum([
    'ok',
    'hash_mismatch',
    'content_missing',
    'path_not_allowed',
    'write_failed',
    'new_file_modified',
  ]).optional(),
});
export type RollbackEntryResult = z.infer<typeof rollbackEntryResultSchema>;

export const rollbackResultSchema = z.object({
  runId: z.string(),
  dryRun: z.boolean(),
  totals: z.object({
    restored: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    conflict: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  entries: z.array(rollbackEntryResultSchema),
});
export type RollbackResult = z.infer<typeof rollbackResultSchema>;
```

设置 schema（`workspaceRootsSchema`、`fileSnapshotSettingsSchema`）同样放此文件，默认值来自常量。

## 3. 数据库（v058）

迁移 `v058-file-snapshots.ts`，纯加法：

```sql
CREATE TABLE file_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  node_id TEXT,
  tool_name TEXT NOT NULL,
  action TEXT NOT NULL,
  path TEXT NOT NULL,
  target_path TEXT,
  existed_before INTEGER NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  written_sha256 TEXT,
  blob_path TEXT,
  truncated INTEGER NOT NULL DEFAULT 0,
  truncation_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_file_snapshots_run ON file_snapshots(run_id, created_at DESC);
CREATE INDEX idx_file_snapshots_created ON file_snapshots(created_at);
CREATE INDEX idx_file_snapshots_path ON file_snapshots(path);
```

- `LATEST_SCHEMA_VERSION` 57 → 58；迁移测试断言 58；
- 快照内容按内容寻址存 `<dataRoot>/snapshots/blobs/<sha256>`；
- 行删除不立即删 blob：由清理服务按引用计数/批处理回收。

仓储接口（`@wbfm/database`，新增 `repositories/workspace/file-snapshot-repo.ts`）：

```ts
createFileSnapshot(input: FileSnapshotCreateFields): FileSnapshotView
listByRun(runId: string, options?: { nodeId?: string }): FileSnapshotView[]
getUsage(): { bytes: number; count: number }
listReferencedBlobs(): string[]
deleteBefore(cutoffIso: string, limit: number): FileSnapshotDeleteResult
deleteByRun(runId: string): FileSnapshotDeleteResult
```

`FileSnapshotDeleteResult = { removed: number; freedBytes: number; blobPaths: string[] }`；
`blobPaths` 已按去重返回，服务层据此删除不再被引用的内容文件。

## 4. 核心服务

### 4.1 FileGuard（`packages/core/src/workspace/file-guard.ts`）

```ts
export interface FileGuard {
  listRoots(): string[];
  setRoots(roots: string[]): string[]; // 校验 + 规范化，失败抛 422
  assertAllowed(target: string): string; // 返回规范化绝对路径，越界抛 422
  isAllowed(target: string): boolean;
}

createFileGuard(deps: {
  dataRoot: string;
  settings: SettingsRepository;
  platform?: NodeJS.Platform;
}): FileGuard
```

规则见 [spec §4](./spec.md)；拒绝原因写入 `ApiError.validation`，消息带 `[file/path-denied:<reason>]` 标记。

### 4.2 SnapshotService（`packages/core/src/workspace/snapshot-service.ts`）

```ts
export interface SnapshotService {
  beforeWrite(input: SnapshotBeforeWrite): FileSnapshotView | null;
  beforeDelete(input: SnapshotBeforeDelete): FileSnapshotView | null;
  beforeMove(input: SnapshotBeforeMove): FileSnapshotView | null;
  afterWrite(input: { snapshotId: string; sha256: string }): void;
  rollback(input: RollbackInput): RollbackResult;
  cleanup(options?: { dryRun?: boolean }): SnapshotCleanupResult;
  usage(): { bytes: number; count: number; quotaBytes: number };
}
```

- 未启用快照时返回 `null`，并在运行详情标注；
- 超大文件在无人值守抛 `FILE_SNAPSHOT_TOO_LARGE`，人工态记录 `truncated`；
- 所有落盘先写 `.tmp` 再 rename；回滚同样原子写。

### 4.3 工具接入

现有与未来文件工具统一从 `ToolContext` 取守卫：

```ts
interface ToolContext {
  // ...
  runId?: string;
  nodeId?: string;
  fileGuard?: FileGuard;
  snapshots?: SnapshotService;
}
```

契约测试（`packages/core/src/tools/contract/file-guard.contract.test.ts`）：

- 扫描所有 `permission: 'write' | 'danger'` 且声明文件写/删/移的工具，必须引用 `fileGuard.assertAllowed`；
- `artifact_write` 例外，但必须只写受控产物目录。

## 5. HTTP API

统一 `defineRoute` + `jsonOk`，响应 `{ data: ... }`：

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/api/workspace/roots` | — | `{ roots: string[]; defaultRoot: string; maxRoots: number }` |
| PUT | `/api/workspace/roots` | `{ roots: string[] }` | 同上；写审计 `workspace_roots_updated` |
| GET | `/api/workspace/snapshot-settings` | — | `{ enabled, maxBytes, quotaBytes, retentionDays }` |
| PUT | `/api/workspace/snapshot-settings` | 同上 | 保存并回显 |
| GET | `/api/flow-runs/[id]/snapshots` | `?nodeId=` | `{ snapshots: FileSnapshotView[]; usage }` |
| POST | `/api/flow-runs/[id]/rollback` | `RollbackRequest` | `RollbackResult` |
| GET | `/api/flow-runs/snapshots/cleanup` | — | `{ usage }` |
| POST | `/api/flow-runs/snapshots/cleanup` | `{ dryRun: boolean }` | `{ removed: number; freedBytes: number; dryRun: boolean }` |

错误：路径越界 422、配额不足 422、快照库不可写 503、回滚冲突 409、写盘失败 500。

## 6. 审计事件

在 `AUDIT_EVENT_KINDS` 追加：

- `workspace_roots_updated`
- `file_path_denied`
- `file_snapshot_created`
- `file_rollback_applied`
- `file_snapshot_cleanup`

`outcome` 统一 JSON：工具、动作、路径、原因码、计数；审计失败不阻断主流程，但写 `console.error`。

## 7. 设置键

| 键 | 默认 | 说明 |
|---|---|---|
| `workspace.allowedRoots` | `[]`（另有内置默认根） | 用户追加根 |
| `flows.fileSnapshots.enabled` | `true` | 按流程关闭需显式写 false |
| `flows.fileSnapshots.maxBytes` | 20 MiB | 单文件上限 |
| `flows.fileSnapshots.quotaBytes` | 512 MiB | 总配额 |
| `flows.fileSnapshots.retentionDays` | 30 | 保留天数 |

## 8. 未决/兼容

- 目录删除：v5.1 拒绝（错误码复用 `FILE_PATH_INVALID`），v5.2 再评估递归快照；
- 移动跨盘：先复制快照再执行，失败按 `FILE_ROLLBACK_FAILED` 处理；
- 旧运行无快照：API 返回空列表 + `enabled: false` 标记；
- CLI/桌面控制：不接入守卫，契约测试显式排除并在文档标注。
