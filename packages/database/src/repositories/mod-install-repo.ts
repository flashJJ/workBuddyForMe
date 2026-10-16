import { randomUUID } from 'node:crypto';
import type { DatabaseInstance } from '../client';
import {
  modInstallRecordSchema,
  type ModInstallRecord,
  type ModInstallSummary,
} from '@wbfm/shared/schemas';

/** mod_installs 表行（v031） */
export interface ModInstallRow {
  id: string;
  pack_id: string;
  name: string;
  pack_version: string;
  author_name: string | null;
  imported_at: string;
  summary_json: string;
}

export interface RecordModInstallInput {
  packId: string;
  name: string;
  packVersion: string;
  authorName?: string | null;
  importedAt: string;
  summary: ModInstallSummary;
}

function mapRow(row: ModInstallRow): ModInstallRecord | null {
  let summary: unknown = {};
  try {
    summary = JSON.parse(row.summary_json || '{}');
  } catch {
    summary = {};
  }
  const result = modInstallRecordSchema.safeParse({
    id: row.id,
    packId: row.pack_id,
    name: row.name,
    packVersion: row.pack_version,
    authorName: row.author_name,
    importedAt: row.imported_at,
    summary,
  });
  return result.success ? result.data : null;
}

/**
 * v2.0 M5 mod 包安装记录仓储：
 * - 只登记导入事实；卸载不级联删除已导入内容（05 §2.2）；
 * - 同 pack_id 重复导入登记多行（随机 id，不做唯一约束）。
 */
export function createModInstallRepository(db: DatabaseInstance) {
  return {
    record(input: RecordModInstallInput): ModInstallRecord {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO mod_installs
           (id, pack_id, name, pack_version, author_name, imported_at, summary_json)
         VALUES (@id, @packId, @name, @packVersion, @authorName, @importedAt, @summaryJson)`,
      ).run({
        id,
        packId: input.packId,
        name: input.name,
        packVersion: input.packVersion,
        authorName: input.authorName ?? null,
        importedAt: input.importedAt,
        summaryJson: JSON.stringify(input.summary),
      });
      return {
        id,
        packId: input.packId,
        name: input.name,
        packVersion: input.packVersion,
        authorName: input.authorName ?? null,
        importedAt: input.importedAt,
        summary: input.summary,
      };
    },

    listAll(): ModInstallRecord[] {
      const rows = db
        .prepare(
          `SELECT id, pack_id, name, pack_version, author_name, imported_at, summary_json
             FROM mod_installs ORDER BY imported_at DESC`,
        )
        .all() as ModInstallRow[];
      return rows.map(mapRow).filter((r): r is ModInstallRecord => r !== null);
    },

    delete(id: string): number {
      return db.prepare(`DELETE FROM mod_installs WHERE id = ?`).run(id).changes;
    },
  };
}

export type ModInstallRepository = ReturnType<typeof createModInstallRepository>;
