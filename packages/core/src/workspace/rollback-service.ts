import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  FileSnapshotView,
  RollbackEntryResult,
  RollbackResult,
  RollbackTotals,
} from '@wbfm/shared/schemas';
import type { FileSnapshotRepository } from '@wbfm/database';
import type { FileGuard } from './file-guard';

/**
 * v5.1 按运行回滚：
 * - 倒序遍历快照，同一路径只处理最新一条；
 * - 覆盖写/删除：目标哈希与写入后哈希不一致视为冲突，需 force；
 * - 新建写：哈希一致才删除；
 * - 移动：恢复源文件，目标原本不存在时删除目标；
 * - 单文件失败不阻断其余文件，dry-run 只产出计划。
 */

export interface RollbackServiceDeps {
  guard: FileGuard;
  snapshots: FileSnapshotRepository;
  blobDir: string;
}

export interface RollbackInput {
  runId: string;
  dryRun?: boolean;
  nodeId?: string;
  paths?: string[];
  force?: string[];
}

export interface RollbackService {
  rollback(input: RollbackInput): RollbackResult;
}

export function createRollbackService(deps: RollbackServiceDeps): RollbackService {
  function readBlob(relative: string): Buffer | null {
    try {
      return readFileSync(join(deps.blobDir, relative));
    } catch {
      return null;
    }
  }

  function processRow(
    row: FileSnapshotView,
    dryRun: boolean,
    force: ReadonlySet<string>,
  ): RollbackEntryResult {
    const forced = force.has(row.path);
    let target: string;
    try {
      target = deps.guard.assertAllowed(row.path);
    } catch {
      return entry(row, 'skipped', 'path_not_allowed');
    }

    if (row.action === 'write_new') {
      if (!existsSync(target)) return entry(row, 'skipped', 'ok');
      const current = hashFile(target);
      if (current !== row.writtenSha256 && !forced) {
        return entry(row, 'conflict', 'new_file_modified');
      }
      if (!dryRun) removeFile(target);
      return entry(row, 'deleted', 'ok');
    }

    if (row.truncated || !row.blobPath) return entry(row, 'skipped', 'content_missing');
    const content = readBlob(row.blobPath);
    if (!content) return entry(row, 'skipped', 'content_missing');

    if (row.action === 'move') {
      const sourceConflict =
        existsSync(target) && hashFile(target) !== row.writtenSha256 && !forced;
      if (sourceConflict) return entry(row, 'conflict', 'hash_mismatch');

      let targetPath: string | null = null;
      if (row.targetPath && !row.existedBefore) {
        try {
          targetPath = deps.guard.assertAllowed(row.targetPath);
        } catch {
          return entry(row, 'conflict', 'path_not_allowed');
        }
        if (existsSync(targetPath) && hashFile(targetPath) !== row.sha256 && !forced) {
          return entry(row, 'conflict', 'hash_mismatch');
        }
      }

      if (!dryRun) {
        writeAtomic(target, content);
        if (targetPath && existsSync(targetPath)) removeFile(targetPath);
      }
      return entry(row, 'restored', 'ok');
    }

    // write_overwrite / delete：目标可能已被修改或已不存在
    if (existsSync(target)) {
      const current = hashFile(target);
      if (current !== row.writtenSha256 && !forced) {
        return entry(row, 'conflict', 'hash_mismatch');
      }
    }
    if (!dryRun) writeAtomic(target, content);
    return entry(row, 'restored', 'ok');
  }

  return {
    rollback(input) {
      const dryRun = input.dryRun ?? true;
      const force = new Set(input.force ?? []);
      const paths = input.paths ? new Set(input.paths) : null;
      const rows = deps.snapshots
        .listByRun(input.runId, input.nodeId ? { nodeId: input.nodeId } : {})
        .filter((row) => !paths || paths.has(row.path));

      const seen = new Set<string>();
      const entries: RollbackEntryResult[] = [];
      for (const row of rows) {
        if (seen.has(row.path)) continue;
        seen.add(row.path);
        entries.push(processRow(row, dryRun, force));
      }

      const totals: RollbackTotals = {
        restored: 0,
        deleted: 0,
        skipped: 0,
        conflict: 0,
        failed: 0,
      };
      for (const item of entries) totals[item.status] += 1;
      return { runId: input.runId, dryRun, totals, entries };
    },
  };
}

function entry(
  row: FileSnapshotView,
  status: RollbackEntryResult['status'],
  reason: NonNullable<RollbackEntryResult['reason']>,
): RollbackEntryResult {
  return { path: row.path, action: row.action, status, reason };
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function writeAtomic(path: string, content: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.rollback.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, path);
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // 已被删除：幂等
  }
}
