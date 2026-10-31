import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface SkillVersionRow {
  id: string;
  skill_state_id: string;
  name: string;
  version: string;
  checksum: string;
  manifest_json: string;
  dir_path: string;
  created_at: string;
}

export interface SkillVersionCreateFields {
  /** 不传则自动生成 UUID */
  id?: string;
  skillStateId: string;
  name: string;
  version: string;
  checksum: string;
  manifestJson: string;
  dirPath: string;
}

export interface SkillVersionUpdateFields {
  checksum?: string;
  manifestJson?: string;
  dirPath?: string;
}

export function createSkillVersionRepository(db: DatabaseInstance) {
  return {
    create(fields: SkillVersionCreateFields) {
      const id = fields.id ?? newId();
      db.prepare(
        `INSERT INTO skill_versions
           (id, skill_state_id, name, version, checksum, manifest_json, dir_path, created_at)
         VALUES
           (@id, @skillStateId, @name, @version, @checksum, @manifestJson, @dirPath, @createdAt)`,
      ).run({
        id,
        skillStateId: fields.skillStateId,
        name: fields.name,
        version: fields.version,
        checksum: fields.checksum,
        manifestJson: fields.manifestJson,
        dirPath: fields.dirPath,
        createdAt: nowIso(),
      });
      return this.get(id)!;
    },

    get(id: string): SkillVersionRow | null {
      return (
        (db.prepare('SELECT * FROM skill_versions WHERE id = ?').get(id) as
          | SkillVersionRow
          | undefined) ?? null
      );
    },

    getByStateVersion(stateId: string, version: string): SkillVersionRow | null {
      return (
        (db
          .prepare('SELECT * FROM skill_versions WHERE skill_state_id = ? AND version = ?')
          .get(stateId, version) as SkillVersionRow | undefined) ?? null
      );
    },

    /** v2.14：跨状态行复用快照（能力包升级会重建 skills_state 行，历史仍需连续） */
    findByNameVersionChecksum(
      name: string,
      version: string,
      checksum: string,
    ): SkillVersionRow | null {
      return (
        (db
          .prepare(
            `SELECT * FROM skill_versions
             WHERE name = ? AND version = ? AND checksum = ?
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(name, version, checksum) as SkillVersionRow | undefined) ?? null
      );
    },

    /** 按技能名列出全部快照（含历史状态行），新的在前 */
    listByName(name: string): SkillVersionRow[] {
      return db
        .prepare(
          'SELECT * FROM skill_versions WHERE name = ? ORDER BY created_at DESC, rowid DESC',
        )
        .all(name) as SkillVersionRow[];
    },

    /** v2.15：同一技能 + 版本的全部行（能力包升级重建状态行后可能有多行） */
    listByNameVersion(name: string, version: string): SkillVersionRow[] {
      return db
        .prepare(
          'SELECT * FROM skill_versions WHERE name = ? AND version = ? ORDER BY created_at DESC, rowid DESC',
        )
        .all(name, version) as SkillVersionRow[];
    },

    /** v2.15：快照目录仍被多少行引用（删除目录前检查） */
    countByDirPath(dirPath: string): number {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM skill_versions WHERE dir_path = ?')
        .get(dirPath) as { n: number };
      return row.n;
    },

    update(id: string, fields: SkillVersionUpdateFields): SkillVersionRow | null {
      const row = this.get(id);
      if (!row) return null;
      const sets: string[] = [];
      const values: Record<string, unknown> = { id };
      if (fields.checksum !== undefined) {
        sets.push('checksum = @checksum');
        values.checksum = fields.checksum;
      }
      if (fields.manifestJson !== undefined) {
        sets.push('manifest_json = @manifestJson');
        values.manifestJson = fields.manifestJson;
      }
      if (fields.dirPath !== undefined) {
        sets.push('dir_path = @dirPath');
        values.dirPath = fields.dirPath;
      }
      if (sets.length === 0) return row;
      db.prepare(`UPDATE skill_versions SET ${sets.join(', ')} WHERE id = @id`).run(values);
      return this.get(id);
    },

    remove(id: string): boolean {
      return db.prepare('DELETE FROM skill_versions WHERE id = ?').run(id).changes > 0;
    },
  };
}

export type SkillVersionRepository = ReturnType<typeof createSkillVersionRepository>;
