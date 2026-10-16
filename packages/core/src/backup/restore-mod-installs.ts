/**
 * v2.0 M5 events 轨加法负载恢复（备份 schema v6）：
 * - modInstalls.json：mod 包安装登记事实，无外键依赖，INSERT OR IGNORE 幂等；
 * - vrmAvatars.json：**仅元数据引用**（G5 红线：.vrm 二进制永不进备份）。
 *   恢复后 fileRef 指向的模型文件在新机不存在，属预期悬空，由调用方产出 warning
 *   提示用户重新导入 VRM；引用行不阻塞恢复。
 * v5 及更早归档缺文件按 0 降级。
 */
import { modInstallRecordSchema, vrmAvatarSchema } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { DatabaseInstance } from '@wbfm/database';

export interface RefRestoreCounts {
  imported: number;
  skipped: number;
  /** 实际新写入的 VRM fileRef（供调用方拼悬空引用 warning） */
  importedRefs: string[];
}

function readJsonArray(buf: Buffer, filename: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(buf.toString('utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError('VALIDATION_ERROR', `${filename} 解析失败，归档可能已损坏`);
  }
}

export function readModInstallsPayload(buf: Buffer): unknown[] {
  return readJsonArray(buf, 'modInstalls.json');
}

export function readVrmAvatarsPayload(buf: Buffer): unknown[] {
  return readJsonArray(buf, 'vrmAvatars.json');
}

export function restoreModInstalls(db: DatabaseInstance, entries: unknown[]): {
  imported: number;
  skipped: number;
} {
  const counts = { imported: 0, skipped: 0 };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO mod_installs
       (id, pack_id, name, pack_version, author_name, imported_at, summary_json)
     VALUES (@id, @packId, @name, @packVersion, @authorName, @importedAt, @summaryJson)`,
  );
  for (const raw of entries) {
    const parsed = modInstallRecordSchema.safeParse(raw);
    if (!parsed.success) {
      counts.skipped++;
      continue;
    }
    try {
      const result = insert.run({
        id: parsed.data.id,
        packId: parsed.data.packId,
        name: parsed.data.name,
        packVersion: parsed.data.packVersion,
        authorName: parsed.data.authorName,
        importedAt: parsed.data.importedAt,
        summaryJson: JSON.stringify(parsed.data.summary),
      });
      if (result.changes > 0) counts.imported++;
      else counts.skipped++;
    } catch {
      counts.skipped++;
    }
  }
  return counts;
}

export function restoreVrmAvatars(db: DatabaseInstance, entries: unknown[]): RefRestoreCounts {
  const counts: RefRestoreCounts = { imported: 0, skipped: 0, importedRefs: [] };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO vrm_avatars
       (id, name, file_ref, byte_length, meta_json, created_at)
     VALUES (@id, @name, @fileRef, @byteLength, @metaJson, @createdAt)`,
  );
  for (const raw of entries) {
    const parsed = vrmAvatarSchema.safeParse(raw);
    if (!parsed.success) {
      counts.skipped++;
      continue;
    }
    try {
      const result = insert.run({
        id: parsed.data.id,
        name: parsed.data.name,
        fileRef: parsed.data.fileRef,
        byteLength: parsed.data.byteLength,
        metaJson: JSON.stringify(parsed.data.meta ?? {}),
        createdAt: parsed.data.createdAt,
      });
      if (result.changes > 0) {
        counts.imported++;
        counts.importedRefs.push(parsed.data.fileRef);
      } else {
        counts.skipped++;
      }
    } catch {
      // file_ref 唯一冲突等约束失败：跳过
      counts.skipped++;
    }
  }
  return counts;
}
