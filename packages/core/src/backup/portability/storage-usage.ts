/**
 * v2.32 M4：存储占用统计与孤儿附件回收。
 * 只读统计按数据根一次遍历分桶；回收只移动到 attachments/.trash/<date>/，
 * 不提供物理删除入口；到期清理由显式动作触发。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, getDataRoot } from '@wbfm/config';
import { createAttachmentRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';

export type StorageBucket = 'database' | 'files' | 'attachments' | 'spills' | 'capabilities' | 'logs' | 'other';

export interface StorageUsage {
  totalBytes: number;
  items: Record<StorageBucket, number>;
  /** 实际扫描的文件数（用于判断是否被上限截断） */
  scannedFiles: number;
  truncated: boolean;
  computedAt: string;
}

export interface OrphanCandidate {
  name: string;
  bytes: number;
}

export interface OrphanScanResult {
  candidates: OrphanCandidate[];
  totalBytes: number;
}

export interface TrashEntry {
  date: string;
  name: string;
  bytes: number;
  trashedAt: string;
}

export interface TrashListing {
  entries: TrashEntry[];
  totalBytes: number;
}

const MAX_SCAN_FILES = 100_000;
const MAX_SCAN_DEPTH = 8;
const CACHE_TTL_MS = 30_000;
const TRASH_RETENTION_DAYS = 7;

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

/** 孤儿附件：目录中存在但附件表无对应 storage_path 的文件 */
export function scanOrphanAttachments(db: DatabaseInstance): OrphanScanResult {
  const dir = getDataDir('attachments');
  if (!fs.existsSync(dir)) return { candidates: [], totalBytes: 0 };
  const referenced = new Set(createAttachmentRepository(db).list().map((row) => row.storage_path));
  const candidates: OrphanCandidate[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || referenced.has(entry.name)) continue;
    try {
      candidates.push({ name: entry.name, bytes: fs.statSync(path.join(dir, entry.name)).size });
    } catch {
      /* ignore */
    }
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return {
    candidates,
    totalBytes: candidates.reduce((sum, item) => sum + item.bytes, 0),
  };
}

function trashRoot(): string {
  return path.join(getDataDir('attachments'), '.trash');
}

function assertSafeName(name: string): void {
  if (!name || name !== path.basename(name) || name === '.' || name === '..') {
    throw ApiError.validation(`非法的附件文件名：${name}`);
  }
}

/** 把候选移动到回收目录（只移动，不删除） */
export function trashOrphanAttachments(
  db: DatabaseInstance,
  names: string[],
): { moved: number; totalBytes: number; date: string } {
  if (names.length === 0) throw ApiError.validation('请选择要回收的孤儿附件');
  const { candidates } = scanOrphanAttachments(db);
  const allowed = new Map(candidates.map((item) => [item.name, item.bytes]));
  const date = new Date().toISOString().slice(0, 10);
  const destDir = path.join(trashRoot(), date);
  fs.mkdirSync(destDir, { recursive: true });

  let moved = 0;
  let totalBytes = 0;
  for (const name of names) {
    assertSafeName(name);
    const bytes = allowed.get(name);
    if (bytes === undefined) throw ApiError.validation(`不是孤儿附件或已处理：${name}`);
    let target = path.join(destDir, name);
    if (fs.existsSync(target)) target = path.join(destDir, `${Date.now()}-${name}`);
    fs.renameSync(path.join(getDataDir('attachments'), name), target);
    moved++;
    totalBytes += bytes;
  }
  return { moved, totalBytes, date };
}

/** 回收目录清单（按日期目录分组展开为条目） */
export function listTrash(): TrashListing {
  const root = trashRoot();
  if (!fs.existsSync(root)) return { entries: [], totalBytes: 0 };
  const entries: TrashEntry[] = [];
  for (const dateDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dateDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name)) continue;
    const datePath = path.join(root, dateDir.name);
    for (const file of fs.readdirSync(datePath, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      try {
        const stat = fs.statSync(path.join(datePath, file.name));
        entries.push({
          date: dateDir.name,
          name: file.name,
          bytes: stat.size,
          trashedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* ignore */
      }
    }
  }
  entries.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  return { entries, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}

/** 从回收目录恢复单个文件（同名冲突时拒绝，避免覆盖） */
export function restoreFromTrash(date: string, name: string): { restored: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw ApiError.validation(`非法的回收日期：${date}`);
  assertSafeName(name);
  const source = path.join(trashRoot(), date, name);
  if (!fs.existsSync(source)) throw ApiError.validation(`回收目录中不存在：${name}`);
  const target = path.join(getDataDir('attachments'), name);
  if (fs.existsSync(target)) throw ApiError.validation(`目标附件已存在，无法恢复：${name}`);
  fs.renameSync(source, target);
  return { restored: name };
}

/** 清理到期回收目录（默认保留 7 天；仅删除已到期的日期目录） */
export function purgeTrash(olderThanDays = TRASH_RETENTION_DAYS): { removedDates: string[]; bytes: number } {
  const root = trashRoot();
  if (!fs.existsSync(root)) return { removedDates: [], bytes: 0 };
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString().slice(0, 10);
  const removedDates: string[] = [];
  let bytes = 0;
  for (const dateDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dateDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name)) continue;
    if (dateDir.name >= cutoff) continue;
    const datePath = path.join(root, dateDir.name);
    let dirBytes = 0;
    for (const file of fs.readdirSync(datePath, { withFileTypes: true })) {
      if (file.isFile()) {
        try {
          dirBytes += fs.statSync(path.join(datePath, file.name)).size;
        } catch {
          /* ignore */
        }
      }
    }
    fs.rmSync(datePath, { recursive: true, force: true });
    removedDates.push(dateDir.name);
    bytes += dirBytes;
  }
  return { removedDates, bytes };
}
