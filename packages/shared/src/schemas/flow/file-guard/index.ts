import { z } from 'zod';
import {
  FILE_ROLLBACK_PATHS_MAX,
  FILE_SNAPSHOT_DEFAULTS,
  FILE_SNAPSHOT_MAX_BYTES,
  FILE_SNAPSHOT_QUOTA_BYTES,
  WORKSPACE_ROOTS_MAX,
} from '../../../constants/tools';

/**
 * v5.1 文件边界与快照契约：
 * - 授权根与快照设置；
 * - 危险动作快照视图；
 * - 按运行回滚的请求/逐文件结果。
 */

export const FILE_SNAPSHOT_ACTIONS = [
  'write_overwrite',
  'write_new',
  'delete',
  'move',
] as const;
export type FileSnapshotAction = (typeof FILE_SNAPSHOT_ACTIONS)[number];

export const FILE_SNAPSHOT_TRUNCATION_REASONS = ['too_large', 'snapshots_disabled'] as const;
export type FileSnapshotTruncationReason = (typeof FILE_SNAPSHOT_TRUNCATION_REASONS)[number];

export const ROLLBACK_ENTRY_STATUSES = [
  'restored',
  'deleted',
  'skipped',
  'conflict',
  'failed',
] as const;
export type RollbackEntryStatus = (typeof ROLLBACK_ENTRY_STATUSES)[number];

export const ROLLBACK_ENTRY_REASONS = [
  'ok',
  'hash_mismatch',
  'content_missing',
  'path_not_allowed',
  'write_failed',
  'new_file_modified',
] as const;
export type RollbackEntryReason = (typeof ROLLBACK_ENTRY_REASONS)[number];

export const workspaceRootsSchema = z.object({
  roots: z
    .array(z.string().trim().min(1).max(1024))
    .max(WORKSPACE_ROOTS_MAX, `授权根最多 ${WORKSPACE_ROOTS_MAX} 个`),
});
export type WorkspaceRootsParsed = z.infer<typeof workspaceRootsSchema>;

export const fileSnapshotSettingsSchema = z.object({
  enabled: z.boolean(),
  maxBytes: z.number().int().min(1).max(FILE_SNAPSHOT_MAX_BYTES),
  quotaBytes: z.number().int().min(FILE_SNAPSHOT_MAX_BYTES).max(8 * FILE_SNAPSHOT_QUOTA_BYTES),
  retentionDays: z.number().int().min(1).max(365),
});
export type FileSnapshotSettingsParsed = z.infer<typeof fileSnapshotSettingsSchema>;

export const fileSnapshotSettingsDefaults = FILE_SNAPSHOT_DEFAULTS;

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
  writtenSha256: z.string().nullable(),
  blobPath: z.string().nullable(),
  truncated: z.boolean(),
  truncationReason: z.enum(FILE_SNAPSHOT_TRUNCATION_REASONS).nullable(),
  createdAt: z.string(),
});
export type FileSnapshotView = z.infer<typeof fileSnapshotViewSchema>;

export const rollbackRequestSchema = z.object({
  dryRun: z.boolean().default(true),
  nodeId: z.string().trim().min(1).optional(),
  paths: z
    .array(z.string().trim().min(1))
    .max(FILE_ROLLBACK_PATHS_MAX, `一次最多回滚 ${FILE_ROLLBACK_PATHS_MAX} 个文件`)
    .optional(),
  force: z.array(z.string().trim().min(1)).max(FILE_ROLLBACK_PATHS_MAX).optional(),
});
export type RollbackRequestParsed = z.infer<typeof rollbackRequestSchema>;

export const rollbackEntryResultSchema = z.object({
  path: z.string(),
  action: z.enum(FILE_SNAPSHOT_ACTIONS),
  status: z.enum(ROLLBACK_ENTRY_STATUSES),
  reason: z.enum(ROLLBACK_ENTRY_REASONS).optional(),
});
export type RollbackEntryResult = z.infer<typeof rollbackEntryResultSchema>;

export const rollbackTotalsSchema = z.object({
  restored: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type RollbackTotals = z.infer<typeof rollbackTotalsSchema>;

export const rollbackResultSchema = z.object({
  runId: z.string(),
  dryRun: z.boolean(),
  totals: rollbackTotalsSchema,
  entries: z.array(rollbackEntryResultSchema),
});
export type RollbackResult = z.infer<typeof rollbackResultSchema>;

export const snapshotCleanupRequestSchema = z.object({
  dryRun: z.boolean().default(true),
});
export type SnapshotCleanupRequestParsed = z.infer<typeof snapshotCleanupRequestSchema>;

export const snapshotCleanupResultSchema = z.object({
  removed: z.number().int().nonnegative(),
  freedBytes: z.number().int().nonnegative(),
  dryRun: z.boolean(),
});
export type SnapshotCleanupResult = z.infer<typeof snapshotCleanupResultSchema>;
