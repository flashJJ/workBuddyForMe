import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  FILE_SNAPSHOT_CLEANUP_BATCH,
  FILE_SNAPSHOT_DEFAULTS,
  FILE_SNAPSHOT_MAX_BYTES,
  FILE_SNAPSHOT_QUOTA_BYTES,
  FILE_SNAPSHOT_RETENTION_DAYS,
} from '@wbfm/shared/constants';
import type { FileSnapshotView, SnapshotCleanupResult } from '@wbfm/shared/schemas';
import type { FileSnapshotRepository, SettingsRepository } from '@wbfm/database';
import type { FileGuard } from './file-guard';

/**
 * v5.1 危险动作快照：
 * - 覆盖写/删除/移动前抓取旧内容，按 sha256 内容寻址存 dataRoot/snapshots/blobs；
 * - 超过单文件上限：无人值守拒绝，人工态只记元数据（truncated）；
 * - 配额不足先清过期快照，仍不足则 fail-closed；
 * - 关闭快照时直接返回 null，越界校验不受影响。
 */

const KEYS = {
  enabled: 'flows.fileSnapshots.enabled',
  maxBytes: 'flows.fileSnapshots.maxBytes',
  quotaBytes: 'flows.fileSnapshots.quotaBytes',
  retentionDays: 'flows.fileSnapshots.retentionDays',
} as const;

/** 设置页与服务共用的键名（单一来源） */
export const FILE_SNAPSHOT_SETTING_KEYS = KEYS;

export interface SnapshotServiceDeps {
  dataRoot: string;
  guard: FileGuard;
  snapshots: FileSnapshotRepository;
  settings: SettingsRepository;
  now?: () => Date;
}

export interface SnapshotActionContext {
  runId: string;
  workflowId: string;
  nodeId?: string | null;
  toolName: string;
  /** 无人值守触发时超限直接拒绝 */
  unattended?: boolean;
}

export interface SnapshotService {
  beforeWrite(input: SnapshotActionContext & { path: string }): FileSnapshotView | null;
  beforeDelete(input: SnapshotActionContext & { path: string }): FileSnapshotView | null;
  beforeMove(
    input: SnapshotActionContext & { sourcePath: string; targetPath: string },
  ): FileSnapshotView | null;
  afterWrite(input: { snapshotId: string; writtenSha256: string }): void;
  cleanup(options?: { dryRun?: boolean }): SnapshotCleanupResult;
  usage(): { bytes: number; count: number; quotaBytes: number };
}

export function createSnapshotService(deps: SnapshotServiceDeps): SnapshotService {
  const now = deps.now ?? (() => new Date());
  const blobDir = join(deps.dataRoot, 'snapshots', 'blobs');

  function maxBytes(): number {
    return positive(deps.settings.getJson<number>(KEYS.maxBytes, FILE_SNAPSHOT_MAX_BYTES), FILE_SNAPSHOT_MAX_BYTES);
  }

  function quotaBytes(): number {
    return positive(
      deps.settings.getJson<number>(KEYS.quotaBytes, FILE_SNAPSHOT_QUOTA_BYTES),
      FILE_SNAPSHOT_QUOTA_BYTES,
    );
  }

  function retentionDays(): number {
    return positive(
      deps.settings.getJson<number>(KEYS.retentionDays, FILE_SNAPSHOT_RETENTION_DAYS),
      FILE_SNAPSHOT_RETENTION_DAYS,
    );
  }

  function enabled(): boolean {
    return deps.settings.getJson<boolean>(KEYS.enabled, FILE_SNAPSHOT_DEFAULTS.enabled) !== false;
  }

  function ensureQuota(size: number): void {
    if (deps.snapshots.getUsage().bytes + size <= quotaBytes()) return;
    cleanupExpired();
    if (deps.snapshots.getUsage().bytes + size > quotaBytes()) {
      throw new ApiError(
        'FILE_SNAPSHOT_QUOTA_EXCEEDED',
        `快照配额不足（上限 ${quotaBytes()} 字节），请先清理或关闭快照`,
      );
    }
  }

  function cleanupExpired(): void {
    const cutoff = new Date(now().getTime() - retentionDays() * 86_400_000).toISOString();
    const blobPaths: string[] = [];
    let guardLoop = 0;
    while (guardLoop < 50) {
      const result = deps.snapshots.deleteBefore(cutoff, FILE_SNAPSHOT_CLEANUP_BATCH);
      if (result.removed === 0) break;
      blobPaths.push(...result.blobPaths);
      guardLoop += 1;
    }
    gcBlobs(blobPaths);
  }

  function gcBlobs(candidates: string[]): void {
    if (candidates.length === 0) return;
    const referenced = new Set(deps.snapshots.listReferencedBlobs());
    for (const relative of new Set(candidates)) {
      if (referenced.has(relative)) continue;
      try {
        unlinkSync(join(blobDir, relative));
      } catch {
        // 已被其他清理或从未落盘：忽略
      }
    }
  }

  function snapshotFile(
    input: SnapshotActionContext & { path: string; targetPath?: string },
    action: 'write_overwrite' | 'delete' | 'move',
    existedBefore: boolean,
  ): FileSnapshotView {
    const size = statSync(input.path).size;
    if (size > maxBytes()) {
      if (input.unattended) {
        throw new ApiError(
          'FILE_SNAPSHOT_TOO_LARGE',
          `文件超过快照上限（${maxBytes()} 字节），无人值守拒绝执行：${input.path}`,
        );
      }
      return deps.snapshots.createSnapshot({
        runId: input.runId,
        workflowId: input.workflowId,
        nodeId: input.nodeId ?? null,
        toolName: input.toolName,
        action,
        path: input.path,
        targetPath: input.targetPath ?? null,
        existedBefore,
        byteSize: size,
        truncated: true,
        truncationReason: 'too_large',
      });
    }

    ensureQuota(size);
    const content = readFileSync(input.path);
    const sha256 = sha256OfBuffer(content);
    const blobPath = writeBlob(blobDir, sha256, content);
    return deps.snapshots.createSnapshot({
      runId: input.runId,
      workflowId: input.workflowId,
      nodeId: input.nodeId ?? null,
      toolName: input.toolName,
      action,
      path: input.path,
      targetPath: input.targetPath ?? null,
      existedBefore,
      byteSize: size,
      sha256,
      blobPath,
    });
  }

  function requireRegularFile(target: string, label: string): void {
    if (!existsSync(target)) {
      throw new ApiError('FILE_PATH_INVALID', `${label}不存在：${target}`);
    }
    if (!statSync(target).isFile()) {
      throw new ApiError(
        'FILE_PATH_INVALID',
        `${label}不是文件（v5.1 不支持目录递归快照）：${target}`,
      );
    }
  }

  return {
    beforeWrite(input) {
      const target = deps.guard.assertAllowed(input.path);
      if (!enabled()) return null;
      if (!existsSync(target)) {
        return deps.snapshots.createSnapshot({
          runId: input.runId,
          workflowId: input.workflowId,
          nodeId: input.nodeId ?? null,
          toolName: input.toolName,
          action: 'write_new',
          path: target,
          existedBefore: false,
        });
      }
      requireRegularFile(target, '目标');
      return snapshotFile({ ...input, path: target }, 'write_overwrite', true);
    },

    beforeDelete(input) {
      const target = deps.guard.assertAllowed(input.path);
      if (!enabled()) return null;
      requireRegularFile(target, '待删除文件');
      return snapshotFile({ ...input, path: target }, 'delete', true);
    },

    beforeMove(input) {
      const source = deps.guard.assertAllowed(input.sourcePath);
      const target = deps.guard.assertAllowed(input.targetPath);
      if (!enabled()) return null;
      requireRegularFile(source, '源文件');
      return snapshotFile(
        { ...input, path: source, targetPath: target },
        'move',
        existsSync(target),
      );
    },

    afterWrite({ snapshotId, writtenSha256 }) {
      deps.snapshots.setWrittenSha256(snapshotId, writtenSha256);
    },

    cleanup(options = {}) {
      const dryRun = options.dryRun ?? false;
      const cutoff = new Date(now().getTime() - retentionDays() * 86_400_000).toISOString();
      if (dryRun) {
        const rows = deps.snapshots.listExpired(cutoff, FILE_SNAPSHOT_CLEANUP_BATCH);
        return {
          removed: rows.length,
          freedBytes: rows.reduce((sum, row) => sum + row.byteSize, 0),
          dryRun: true,
        };
      }
      let removed = 0;
      let freedBytes = 0;
      const blobPaths: string[] = [];
      for (let index = 0; index < 50; index += 1) {
        const result = deps.snapshots.deleteBefore(cutoff, FILE_SNAPSHOT_CLEANUP_BATCH);
        if (result.removed === 0) break;
        removed += result.removed;
        freedBytes += result.freedBytes;
        blobPaths.push(...result.blobPaths);
      }
      gcBlobs(blobPaths);
      return { removed, freedBytes, dryRun: false };
    },

    usage() {
      return { ...deps.snapshots.getUsage(), quotaBytes: quotaBytes() };
    },
  };
}

export function sha256OfBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 内容寻址落盘：同一 sha256 只存一份，先写临时文件再 rename */
function writeBlob(blobDir: string, sha256: string, content: Buffer): string {
  mkdirSync(blobDir, { recursive: true });
  const relative = sha256;
  const finalPath = join(blobDir, relative);
  if (existsSync(finalPath)) return relative;
  const tempPath = `${finalPath}.${process.pid}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, finalPath);
  return relative;
}
