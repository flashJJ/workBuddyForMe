import type { StageScenePayload } from '@wbfm/shared/schemas';
import type { StageSceneRecord } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

interface StageSceneRow {
  id: string;
  name: string;
  is_builtin: number;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: StageSceneRow): StageSceneRecord {
  let payload: StageScenePayload;
  try {
    payload = JSON.parse(row.payload_json) as StageScenePayload;
  } catch {
    throw new Error(`stage_scenes.payload_json 损坏：${row.id}`);
  }
  return {
    id: row.id,
    name: row.name,
    isBuiltin: row.is_builtin === 1,
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface StageSceneUpsertFields {
  id?: string;
  name: string;
  payload: StageScenePayload;
  createdAt?: string;
  updatedAt?: string;
}

export interface StageSceneRepository {
  create(fields: StageSceneUpsertFields): StageSceneRecord;
  update(id: string, fields: { name?: string; payload?: StageScenePayload }): StageSceneRecord | null;
  delete(id: string): boolean;
  findById(id: string): StageSceneRecord | null;
  list(): StageSceneRecord[];
  /** 恢复用：INSERT OR IGNORE 幂等 */
  upsertIgnore(record: StageSceneRecord): void;
}

export function createStageSceneRepository(db: DatabaseInstance): StageSceneRepository {
  return {
    create(fields) {
      const id = fields.id ?? newId();
      const ts = fields.createdAt ?? nowIso();
      db.prepare(
        `INSERT INTO stage_scenes(id,name,is_builtin,payload_json,created_at,updated_at)
         VALUES (@id,@name,0,@payloadJson,@createdAt,@updatedAt)`,
      ).run({
        id,
        name: fields.name,
        payloadJson: JSON.stringify(fields.payload),
        createdAt: ts,
        updatedAt: fields.updatedAt ?? ts,
      });
      return this.findById(id)!;
    },

    update(id, fields) {
      const ts = nowIso();
      const result = db
        .prepare(
          `UPDATE stage_scenes SET
             name = COALESCE(@name, name),
             payload_json = COALESCE(@payloadJson, payload_json),
             updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          id,
          name: fields.name ?? null,
          payloadJson: fields.payload ? JSON.stringify(fields.payload) : null,
          updatedAt: ts,
        });
      if (result.changes === 0) return null;
      return this.findById(id);
    },

    delete(id) {
      return db.prepare(`DELETE FROM stage_scenes WHERE id = ?`).run(id).changes > 0;
    },

    findById(id) {
      const row = db.prepare(`SELECT * FROM stage_scenes WHERE id = ?`).get(id) as
        | StageSceneRow
        | undefined;
      return row ? mapRow(row) : null;
    },

    list() {
      const rows = db
        .prepare(`SELECT * FROM stage_scenes ORDER BY created_at ASC`)
        .all() as StageSceneRow[];
      return rows.map(mapRow);
    },

    upsertIgnore(record) {
      db.prepare(
        `INSERT OR IGNORE INTO stage_scenes(id,name,is_builtin,payload_json,created_at,updated_at)
         VALUES (@id,@name,@isBuiltin,@payloadJson,@createdAt,@updatedAt)`,
      ).run({
        id: record.id,
        name: record.name,
        isBuiltin: record.isBuiltin ? 1 : 0,
        payloadJson: JSON.stringify(record.payload),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    },
  };
}
