import type {
  FileSnapshotAction,
  FileSnapshotTruncationReason,
  FileSnapshotView,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/** v5.1 文件快照仓储：元数据在库，内容按 sha256 存 dataRoot/snapshots/blobs */

export interface FileSnapshotRow {
  id: string;
  run_id: string;
  workflow_id: string;
  node_id: string | null;
  tool_name: string;
  action: string;
  path: string;
  target_path: string | null;
  existed_before: number;
  byte_size: number;
  sha256: string | null;
  written_sha256: string | null;
  blob_path: string | null;
  truncated: number;
  truncation_reason: string | null;
  created_at: string;
}

function mapSnapshot(row: FileSnapshotRow): FileSnapshotView {
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    toolName: row.tool_name,
    action: row.action as FileSnapshotAction,
    path: row.path,
    targetPath: row.target_path,
    existedBefore: row.existed_before === 1,
    byteSize: row.byte_size,
    sha256: row.sha256,
    truncated: row.truncated === 1,
    truncationReason: row.truncation_reason as FileSnapshotTruncationReason | null,
    createdAt: row.created_at,
  };
}

export interface FileSnapshotCreateFields {
  runId: string;
  workflowId: string;
  nodeId?: string | null;
  toolName: string;
  action: FileSnapshotAction;
  path: string;
  targetPath?: string | null;
  existedBefore: boolean;
  byteSize?: number;
  sha256?: string | null;
  writtenSha256?: string | null;
  blobPath?: string | null;
  truncated?: boolean;
  truncationReason?: FileSnapshotTruncationReason | null;
  createdAt?: string;
}

export interface FileSnapshotDeleteResult {
  removed: number;
  freedBytes: number;
  /** 已不再被任何行引用的内容 blob（相对路径），供服务层删文件 */
  blobPaths: string[];
}

export function createFileSnapshotRepository(db: DatabaseInstance) {
  const insert = db.prepare(
    `INSERT INTO file_snapshots
       (id, run_id, workflow_id, node_id, tool_name, action, path, target_path,
        existed_before, byte_size, sha256, written_sha256, blob_path,
        truncated, truncation_reason, created_at)
     VALUES
       (@id, @runId, @workflowId, @nodeId, @toolName, @action, @path, @targetPath,
        @existedBefore, @byteSize, @sha256, @writtenSha256, @blobPath,
        @truncated, @truncationReason, @createdAt)`,
  );

  function removeRows(rows: Array<{ id: string; blob_path: string | null; byte_size: number }>) {
    if (rows.length === 0) return { removed: 0, freedBytes: 0, blobPaths: [] };
    const remove = db.prepare('DELETE FROM file_snapshots WHERE id = ?');
    const tx = db.transaction(() => {
      for (const row of rows) remove.run(row.id);
    });
    tx();
    return {
      removed: rows.length,
      freedBytes: rows.reduce((sum, row) => sum + row.byte_size, 0),
      blobPaths: [...new Set(rows.map((row) => row.blob_path).filter(Boolean) as string[])],
    };
  }

  return {
    createSnapshot(fields: FileSnapshotCreateFields): FileSnapshotView {
      const id = newId();
      insert.run({
        id,
        runId: fields.runId,
        workflowId: fields.workflowId,
        nodeId: fields.nodeId ?? null,
        toolName: fields.toolName,
        action: fields.action,
        path: fields.path,
        targetPath: fields.targetPath ?? null,
        existedBefore: fields.existedBefore ? 1 : 0,
        byteSize: fields.byteSize ?? 0,
        sha256: fields.sha256 ?? null,
        writtenSha256: fields.writtenSha256 ?? null,
        blobPath: fields.blobPath ?? null,
        truncated: fields.truncated ? 1 : 0,
        truncationReason: fields.truncationReason ?? null,
        createdAt: fields.createdAt ?? nowIso(),
      });
      const row = db.prepare('SELECT * FROM file_snapshots WHERE id = ?').get(id) as FileSnapshotRow;
      return mapSnapshot(row);
    },

    listByRun(runId: string, options: { nodeId?: string } = {}): FileSnapshotView[] {
      const rows = options.nodeId
        ? (db
            .prepare(
              `SELECT * FROM file_snapshots WHERE run_id = ? AND node_id = ?
               ORDER BY created_at DESC, id DESC`,
            )
            .all(runId, options.nodeId) as FileSnapshotRow[])
        : (db
            .prepare(
              `SELECT * FROM file_snapshots WHERE run_id = ?
               ORDER BY created_at DESC, id DESC`,
            )
            .all(runId) as FileSnapshotRow[]);
      return rows.map(mapSnapshot);
    },

    getUsage(): { bytes: number; count: number } {
      const row = db
        .prepare(
          'SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM file_snapshots',
        )
        .get() as { count: number; bytes: number };
      return { count: row.count, bytes: row.bytes };
    },

    listReferencedBlobs(): string[] {
      const rows = db
        .prepare(
          'SELECT DISTINCT blob_path FROM file_snapshots WHERE blob_path IS NOT NULL ORDER BY blob_path',
        )
        .all() as Array<{ blob_path: string }>;
      return rows.map((row) => row.blob_path);
    },

    deleteBefore(cutoffIso: string, limit: number): FileSnapshotDeleteResult {
      const rows = db
        .prepare(
          `SELECT id, blob_path, byte_size FROM file_snapshots
           WHERE created_at < ? ORDER BY created_at ASC LIMIT ?`,
        )
        .all(cutoffIso, limit) as Array<{
        id: string;
        blob_path: string | null;
        byte_size: number;
      }>;
      return removeRows(rows);
    },

    deleteByRun(runId: string): FileSnapshotDeleteResult {
      const rows = db
        .prepare('SELECT id, blob_path, byte_size FROM file_snapshots WHERE run_id = ?')
        .all(runId) as Array<{ id: string; blob_path: string | null; byte_size: number }>;
      return removeRows(rows);
    },
  };
}

export type FileSnapshotRepository = ReturnType<typeof createFileSnapshotRepository>;
