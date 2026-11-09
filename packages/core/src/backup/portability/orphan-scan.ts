/**
 * v2.33：孤儿附件扫描（只读，从 storage-usage.ts 拆出以满足 300 行门禁）。
 * - files：目录中存在但附件表无对应 storage_path；
 * - unreferenced：附件行存在、引用数为 0、创建超过 7 天（排除任务截图）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '@wbfm/config';
import {
  createAttachmentRefRepository,
  createAttachmentRepository,
  type DatabaseInstance,
} from '@wbfm/database';

export interface OrphanFileCandidate {
  name: string;
  bytes: number;
}

/** v2.33：有附件行、引用数为 0、且创建超过 7 天的附件 */
export interface UnreferencedAttachment {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  bytes: number;
  contentHash: string;
  createdAt: string;
}

export interface OrphanScanResult {
  /** 目录中有文件、附件表无对应 storage_path */
  files: OrphanFileCandidate[];
  /** 附件行存在但无引用，且创建超过保留期 */
  unreferenced: UnreferencedAttachment[];
  filesBytes: number;
  unreferencedBytes: number;
  totalBytes: number;
}

/** 未引用附件需超过 7 天才进入候选，避免回收仍在途的上传 */
const UNREFERENCED_RETENTION_DAYS = 7;

/**
 * 任务截图仍由 task_steps.screenshot_path 引用，
 * 虽未进入 attachment_refs，也不能当作未引用附件回收。
 */
function taskScreenshotPaths(db: DatabaseInstance): Set<string> {
  const hasTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_steps'`)
    .get();
  if (!hasTable) return new Set();
  const rows = db
    .prepare(
      `SELECT screenshot_path FROM task_steps
       WHERE screenshot_path IS NOT NULL AND screenshot_path != ''`,
    )
    .all() as Array<{ screenshot_path: string }>;
  return new Set(rows.map((row) => row.screenshot_path));
}

/** 孤儿附件扫描（dry-run 只读） */
export function scanOrphanAttachments(db: DatabaseInstance): OrphanScanResult {
  const dir = getDataDir('attachments');
  const rows = createAttachmentRepository(db).list();
  const files: OrphanFileCandidate[] = [];
  if (fs.existsSync(dir)) {
    const referenced = new Set(rows.map((row) => row.storage_path));
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || referenced.has(entry.name)) continue;
      try {
        files.push({ name: entry.name, bytes: fs.statSync(path.join(dir, entry.name)).size });
      } catch {
        /* ignore */
      }
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));

  const referencedIds = new Set(
    createAttachmentRefRepository(db).list().map((ref) => ref.attachmentId),
  );
  const taskShots = taskScreenshotPaths(db);
  const cutoff = new Date(
    Date.now() - UNREFERENCED_RETENTION_DAYS * 86_400_000,
  ).toISOString();
  const unreferenced = rows
    .filter(
      (row) =>
        !referencedIds.has(row.id) &&
        row.created_at < cutoff &&
        !taskShots.has(row.storage_path),
    )
    .map((row) => ({
      id: row.id,
      name: row.storage_path,
      filename: row.filename,
      mimeType: row.mime_type,
      bytes: row.byte_size,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filesBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  const unreferencedBytes = unreferenced.reduce((sum, item) => sum + item.bytes, 0);
  return {
    files,
    unreferenced,
    filesBytes,
    unreferencedBytes,
    totalBytes: filesBytes + unreferencedBytes,
  };
}
