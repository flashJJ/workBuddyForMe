/**
 * v2.33 M3：回收目录（attachments/.trash/<date>/）与清单。
 * 清单记录被回收的文件名映射与附件行快照，恢复时先重建行再移回文件；
 * 清单缺失时退回 v2.32 的「仅移文件」语义并在结果中标注。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createAttachmentRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';

export const TRASH_MANIFEST_FILE = 'manifest.json';

export interface TrashManifestAttachment {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storagePath: string;
  contentHash: string;
  createdAt: string;
}

export interface TrashManifestFile {
  /** 回收目录中的实际文件名（冲突时会加前缀） */
  name: string;
  /** 原始附件文件名（attachments/ 下的 storage_path） */
  originalName: string;
  bytes: number;
}

export interface TrashManifest {
  version: 1;
  trashedAt: string;
  files: TrashManifestFile[];
  attachments: TrashManifestAttachment[];
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

export interface TrashRestoreResult {
  restored: string;
  /** 是否按清单重建了附件行 */
  recreatedRow: boolean;
  /** 是否应用了清单（false = 旧目录仅移文件） */
  manifestApplied: boolean;
}

export function trashRoot(): string {
  return path.join(getDataDir('attachments'), '.trash');
}

export function assertSafeName(name: string): void {
  if (!name || name !== path.basename(name) || name === '.' || name === '..') {
    throw ApiError.validation(`非法的附件文件名：${name}`);
  }
}

export function readTrashManifest(date: string): TrashManifest | null {
  const file = path.join(trashRoot(), date, TRASH_MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as TrashManifest;
    if (!Array.isArray(parsed.files) || !Array.isArray(parsed.attachments)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 追加写入当日清单（同日多次回收合并，按文件名/附件 id 去重） */
export function appendTrashManifest(
  date: string,
  files: TrashManifestFile[],
  attachments: TrashManifestAttachment[],
): void {
  const existing = readTrashManifest(date);
  const merged: TrashManifest = {
    version: 1,
    trashedAt: new Date().toISOString(),
    files: existing?.files ?? [],
    attachments: existing?.attachments ?? [],
  };
  const fileNames = new Set(merged.files.map((file) => file.name));
  const attachmentIds = new Set(merged.attachments.map((row) => row.id));
  for (const file of files) {
    if (!fileNames.has(file.name)) merged.files.push(file);
  }
  for (const row of attachments) {
    if (!attachmentIds.has(row.id)) merged.attachments.push(row);
  }
  const dir = path.join(trashRoot(), date);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, TRASH_MANIFEST_FILE), JSON.stringify(merged, null, 2));
}

/** 回收目录清单；manifest.json 不作为可恢复条目展示 */
export function listTrash(): TrashListing {
  const root = trashRoot();
  if (!fs.existsSync(root)) return { entries: [], totalBytes: 0 };
  const entries: TrashEntry[] = [];
  for (const dateDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dateDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name)) continue;
    const datePath = path.join(root, dateDir.name);
    const fileNames = new Set<string>();
    for (const file of fs.readdirSync(datePath, { withFileTypes: true })) {
      if (!file.isFile() || file.name === TRASH_MANIFEST_FILE) continue;
      try {
        const stat = fs.statSync(path.join(datePath, file.name));
        fileNames.add(file.name);
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
    // 文件已缺失但清单仍有行快照：保留可恢复条目
    const manifest = readTrashManifest(dateDir.name);
    if (!manifest) continue;
    const covered = new Set(
      manifest.files
        .filter((file) => fileNames.has(file.name))
        .map((file) => file.originalName),
    );
    for (const row of manifest.attachments) {
      if (covered.has(row.storagePath)) continue;
      entries.push({
        date: dateDir.name,
        name: row.storagePath,
        bytes: row.byteSize,
        trashedAt: manifest.trashedAt,
      });
    }
  }
  entries.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  return { entries, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}

/** 从回收目录恢复：先按清单重建附件行，再把文件移回 attachments/（同名冲突拒绝） */
export function restoreFromTrash(
  db: DatabaseInstance,
  date: string,
  name: string,
): TrashRestoreResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw ApiError.validation(`非法的回收日期：${date}`);
  assertSafeName(name);
  const source = path.join(trashRoot(), date, name);
  const manifest = readTrashManifest(date);
  const fileEntry = manifest?.files.find((file) => file.name === name);
  const originalName = fileEntry?.originalName ?? name;
  const snapshot = manifest?.attachments.find((row) => row.storagePath === originalName);
  const fileExists = fs.existsSync(source);
  if (!fileExists && !snapshot) throw ApiError.validation(`回收目录中不存在：${name}`);

  const targetName = snapshot?.storagePath ?? originalName;
  assertSafeName(targetName);
  const target = path.join(getDataDir('attachments'), targetName);
  if (fileExists && fs.existsSync(target)) {
    throw ApiError.validation(`目标附件已存在，无法恢复：${targetName}`);
  }

  let recreatedRow = false;
  if (snapshot && !createAttachmentRepository(db).findRowById(snapshot.id)) {
    db.prepare(
      `INSERT INTO attachments
         (id, filename, mime_type, byte_size, storage_path, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshot.id,
      snapshot.filename,
      snapshot.mimeType,
      snapshot.byteSize,
      snapshot.storagePath,
      snapshot.contentHash,
      snapshot.createdAt,
    );
    recreatedRow = true;
  }
  if (fileExists) fs.renameSync(source, target);
  return { restored: targetName, recreatedRow, manifestApplied: Boolean(snapshot) };
}

/** 清理到期回收目录（默认保留 7 天；仅删除已到期的日期目录） */
export function purgeTrash(olderThanDays = 7): { removedDates: string[]; bytes: number } {
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
