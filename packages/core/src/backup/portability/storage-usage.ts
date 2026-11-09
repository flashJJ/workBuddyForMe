/**
 * v2.32 M4：存储占用统计与孤儿附件回收。
 * 只读统计按数据根一次遍历分桶；回收只移动到 attachments/.trash/<date>/，
 * 不提供物理删除入口；到期清理由显式动作触发。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, getDataRoot } from '@wbfm/config';
import {
  createAttachmentRefRepository,
  createAttachmentRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  appendTrashManifest,
  assertSafeName,
  trashRoot,
  type TrashManifestAttachment,
  type TrashManifestFile,
} from './trash-store';

export type StorageBucket = 'database' | 'files' | 'attachments' | 'spills' | 'capabilities' | 'logs' | 'other';

export interface StorageUsage {
  totalBytes: number;
  items: Record<StorageBucket, number>;
  /** 实际扫描的文件数（用于判断是否被上限截断） */
  scannedFiles: number;
  truncated: boolean;
  computedAt: string;
}

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

export interface TrashOrphansResult {
  moved: number;
  totalBytes: number;
  date: string;
  /** v2.33：同事务删除的 unreferenced 附件行数 */
  recordsRemoved: number;
}

const MAX_SCAN_FILES = 100_000;
const MAX_SCAN_DEPTH = 8;
const CACHE_TTL_MS = 30_000;
/** 未引用附件需超过 7 天才进入候选，避免回收仍在途的上传 */
const UNREFERENCED_RETENTION_DAYS = 7;

const BUCKET_BY_TOP: Record<string, StorageBucket> = {
  db: 'database',
  files: 'files',
  attachments: 'attachments',
  spills: 'spills',
  capabilities: 'capabilities',
  logs: 'logs',
};

let cache: { root: string; result: StorageUsage; expiresAt: number } | null = null;

function emptyBuckets(): Record<StorageBucket, number> {
  return { database: 0, files: 0, attachments: 0, spills: 0, capabilities: 0, logs: 0, other: 0 };
}

interface WalkState {
  files: number;
  truncated: boolean;
}

function walk(dir: string, bucket: StorageBucket, items: Record<StorageBucket, number>, depth: number, state: WalkState): void {
  if (depth > MAX_SCAN_DEPTH || state.truncated) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.files >= MAX_SCAN_FILES) {
      state.truncated = true;
      return;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, bucket, items, depth + 1, state);
    } else if (entry.isFile()) {
      try {
        items[bucket] += fs.statSync(full).size;
        state.files++;
      } catch {
        /* 扫描期间文件被删除：忽略 */
      }
    }
  }
}

/** 分桶占用：一次遍历数据根，按顶层目录归类；30 秒内复用结果 */
export function getStorageUsage(): StorageUsage {
  const root = getDataRoot();
  if (cache && cache.root === root && cache.expiresAt > Date.now()) return cache.result;

  const items = emptyBuckets();
  const state: WalkState = { files: 0, truncated: false };
  let topEntries: fs.Dirent[] = [];
  try {
    topEntries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    /* 数据根尚不存在：返回全 0 */
  }
  for (const entry of topEntries) {
    const bucket = BUCKET_BY_TOP[entry.name] ?? 'other';
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(full, bucket, items, 0, state);
    } else if (entry.isFile()) {
      try {
        items[bucket] += fs.statSync(full).size;
        state.files++;
      } catch {
        /* ignore */
      }
    }
  }

  const totalBytes = Object.values(items).reduce((sum, value) => sum + value, 0);
  const result: StorageUsage = {
    totalBytes,
    items,
    scannedFiles: state.files,
    truncated: state.truncated,
    computedAt: new Date().toISOString(),
  };
  cache = { root, result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

/** 测试用：清空短时缓存 */
export function resetStorageUsageCache(): void {
  cache = null;
}

/**
 * v2.33：任务截图仍由 task_steps.screenshot_path 引用，
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

/**
 * 孤儿附件扫描（dry-run 只读）：
 * - files：目录中存在但附件表无对应 storage_path；
 * - unreferenced：附件行存在、引用数为 0、创建超过 7 天。
 */
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

/**
 * 把孤儿文件移动到回收目录并写清单；unreferenced 附件行在同一事务中删除。
 * 文件先移动、清单先落盘，删除失败时仍可从回收目录恢复。
 */
export function trashOrphanAttachments(
  db: DatabaseInstance,
  names: string[],
): TrashOrphansResult {
  if (names.length === 0) throw ApiError.validation('请选择要回收的孤儿附件');
  const scan = scanOrphanAttachments(db);
  const fileMap = new Map(scan.files.map((item) => [item.name, item.bytes]));
  const rowMap = new Map(scan.unreferenced.map((row) => [row.name, row]));
  const date = new Date().toISOString().slice(0, 10);
  const destDir = path.join(trashRoot(), date);
  fs.mkdirSync(destDir, { recursive: true });
  const used: Set<string> = new Set(
    fs.readdirSync(destDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name),
  );

  const manifestFiles: TrashManifestFile[] = [];
  const snapshots: TrashManifestAttachment[] = [];
  const rowIds: string[] = [];
  let moved = 0;
  let totalBytes = 0;

  for (const name of new Set(names)) {
    assertSafeName(name);
    const bytes = fileMap.get(name);
    const row = rowMap.get(name);
    if (bytes === undefined && !row) throw ApiError.validation(`不是孤儿附件或已处理：${name}`);

    if (row) {
      snapshots.push({
        id: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.bytes,
        storagePath: row.name,
        contentHash: row.contentHash,
        createdAt: row.createdAt,
      });
      rowIds.push(row.id);
    }

    // unreferenced 行不在 files 分类里，但对应文件同样需要移入回收目录
    let moveBytes = bytes;
    if (moveBytes === undefined && row) {
      const rowFile = path.join(getDataDir('attachments'), row.name);
      if (fs.existsSync(rowFile)) moveBytes = fs.statSync(rowFile).size;
    }

    if (moveBytes !== undefined) {
      let targetName = name;
      let suffix = 0;
      while (used.has(targetName)) targetName = `${Date.now()}-${suffix++}-${name}`;
      used.add(targetName);
      fs.renameSync(
        path.join(getDataDir('attachments'), name),
        path.join(destDir, targetName),
      );
      manifestFiles.push({ name: targetName, originalName: name, bytes: moveBytes });
      moved++;
      totalBytes += moveBytes;
    }
  }

  if (manifestFiles.length > 0 || snapshots.length > 0) {
    appendTrashManifest(date, manifestFiles, snapshots);
  }

  let recordsRemoved = 0;
  if (rowIds.length > 0) {
    const remove = db.prepare(
      `DELETE FROM attachments WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM attachment_refs WHERE attachment_id = ?)`,
    );
    db.transaction(() => {
      for (const id of rowIds) recordsRemoved += remove.run(id, id).changes;
    })();
  }

  return { moved, totalBytes, date, recordsRemoved };
}
