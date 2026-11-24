import { describe, expect, it } from 'vitest';
import {
  FILE_ROLLBACK_PATHS_MAX,
  FILE_SNAPSHOT_DEFAULTS,
  FILE_SNAPSHOT_MAX_BYTES,
  FILE_SNAPSHOT_QUOTA_BYTES,
  FILE_SNAPSHOT_RETENTION_DAYS,
  WORKSPACE_ROOTS_MAX,
} from '../../../constants/workspace';
import {
  fileSnapshotSettingsSchema,
  fileSnapshotViewSchema,
  rollbackRequestSchema,
  rollbackResultSchema,
  workspaceRootsSchema,
} from '../file-guard';

/** v5.1 M1：文件边界与快照契约的边界值 */

describe('v5.1 授权根契约', () => {
  it('最多 8 个根，空字符串被拒绝', () => {
    const roots = Array.from({ length: WORKSPACE_ROOTS_MAX }, (_, i) => `D:/workspace-${i}`);
    expect(workspaceRootsSchema.safeParse({ roots }).success).toBe(true);
    expect(workspaceRootsSchema.safeParse({ roots: [...roots, 'E:/one-more'] }).success).toBe(false);
    expect(workspaceRootsSchema.safeParse({ roots: ['  '] }).success).toBe(false);
  });
});

describe('v5.1 快照设置契约', () => {
  it('默认值可解析，且来自共享常量', () => {
    const parsed = fileSnapshotSettingsSchema.parse({ ...FILE_SNAPSHOT_DEFAULTS });
    expect(parsed.maxBytes).toBe(FILE_SNAPSHOT_MAX_BYTES);
    expect(parsed.quotaBytes).toBe(FILE_SNAPSHOT_QUOTA_BYTES);
    expect(parsed.retentionDays).toBe(FILE_SNAPSHOT_RETENTION_DAYS);
  });

  it('单文件上限、配额与保留天数越界被拒绝', () => {
    const base = { ...FILE_SNAPSHOT_DEFAULTS };
    expect(
      fileSnapshotSettingsSchema.safeParse({ ...base, maxBytes: FILE_SNAPSHOT_MAX_BYTES + 1 })
        .success,
    ).toBe(false);
    expect(
      fileSnapshotSettingsSchema.safeParse({ ...base, quotaBytes: FILE_SNAPSHOT_MAX_BYTES - 1 })
        .success,
    ).toBe(false);
    expect(fileSnapshotSettingsSchema.safeParse({ ...base, retentionDays: 0 }).success).toBe(false);
    expect(fileSnapshotSettingsSchema.safeParse({ ...base, retentionDays: 366 }).success).toBe(
      false,
    );
  });
});

describe('v5.1 回滚契约', () => {
  it('dryRun 默认 true，paths/force 有上限', () => {
    expect(rollbackRequestSchema.parse({}).dryRun).toBe(true);
    const tooMany = Array.from({ length: FILE_ROLLBACK_PATHS_MAX + 1 }, (_, i) => `a/${i}.txt`);
    expect(rollbackRequestSchema.safeParse({ paths: tooMany }).success).toBe(false);
    expect(
      rollbackRequestSchema.safeParse({ paths: ['a.txt'], force: ['a.txt'], dryRun: false }).success,
    ).toBe(true);
  });

  it('快照视图与回滚结果可序列化', () => {
    const snapshot = fileSnapshotViewSchema.parse({
      id: 's1',
      runId: 'r1',
      nodeId: null,
      toolName: 'write_file',
      action: 'write_overwrite',
      path: 'D:/workspace/a.txt',
      targetPath: null,
      existedBefore: true,
      byteSize: 12,
      sha256: 'a'.repeat(64),
      truncated: false,
      truncationReason: null,
      createdAt: '2026-11-24T00:00:00.000Z',
    });
    expect(snapshot.action).toBe('write_overwrite');

    const result = rollbackResultSchema.parse({
      runId: 'r1',
      dryRun: true,
      totals: { restored: 1, deleted: 0, skipped: 1, conflict: 1, failed: 0 },
      entries: [
        { path: 'D:/workspace/a.txt', action: 'write_overwrite', status: 'restored', reason: 'ok' },
        { path: 'D:/workspace/b.txt', action: 'write_new', status: 'conflict', reason: 'hash_mismatch' },
      ],
    });
    expect(result.totals.conflict).toBe(1);
    expect(result.entries[1]?.status).toBe('conflict');
  });
});
