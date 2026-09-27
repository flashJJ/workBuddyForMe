import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface SkillStateRow {
  id: string;
  name: string;
  enabled: number;
  source_path: string;
  created_at: string;
  updated_at: string;
}

export interface SkillStateCreateFields {
  /** 不传则自动生成 UUID */
  id?: string;
  name: string;
  enabled?: boolean;
  sourcePath?: string;
}

export interface SkillStateUpdateFields {
  enabled?: boolean;
  sourcePath?: string;
}

function mapRow(row: SkillStateRow) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    sourcePath: row.source_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSkillStateRepository(db: DatabaseInstance) {
  return {
    create(fields: SkillStateCreateFields) {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO skills_state
           (id, name, enabled, source_path, created_at, updated_at)
         VALUES
           (@id, @name, @enabled, @sourcePath, @ts, @ts)`,
      ).run({
        id,
        name: fields.name,
        enabled: (fields.enabled ?? true) ? 1 : 0,
        sourcePath: fields.sourcePath ?? '',
        ts,
      });
      return mapRow(this.getRow(id)!);
    },

    list() {
      const rows = db.prepare('SELECT * FROM skills_state ORDER BY created_at ASC, name ASC').all() as SkillStateRow[];
      return rows.map(mapRow);
    },

    get(id: string) {
      const row = this.getRow(id);
      return row ? mapRow(row) : null;
    },

    getByName(name: string) {
      const row = db.prepare('SELECT * FROM skills_state WHERE name = ?').get(name) as SkillStateRow | undefined;
      return row ? mapRow(row) : null;
    },

    getRow(id: string): SkillStateRow | null {
      return (db.prepare('SELECT * FROM skills_state WHERE id = ?').get(id) as SkillStateRow | undefined) ?? null;
    },

    update(id: string, fields: SkillStateUpdateFields) {
      const row = this.getRow(id);
      if (!row) return null;
      const sets: string[] = [];
      const values: Record<string, unknown> = { id, updated_at: nowIso() };
      if (fields.enabled !== undefined) {
        sets.push('enabled = @enabled');
        values.enabled = fields.enabled ? 1 : 0;
      }
      if (fields.sourcePath !== undefined) {
        sets.push('source_path = @sourcePath');
        values.sourcePath = fields.sourcePath;
      }
      if (sets.length === 0) return mapRow(row);
      db.prepare(`UPDATE skills_state SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(values);
      return mapRow(this.getRow(id)!);
    },

    remove(id: string): boolean {
      return db.prepare('DELETE FROM skills_state WHERE id = ?').run(id).changes > 0;
    },

    removeByName(name: string): boolean {
      return db.prepare('DELETE FROM skills_state WHERE name = ?').run(name).changes > 0;
    },
  };
}

export type SkillStateRepository = ReturnType<typeof createSkillStateRepository>;
