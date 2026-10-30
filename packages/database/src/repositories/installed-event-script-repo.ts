import type { DatabaseInstance } from '../client';
import { nowIso } from './mappers';

export interface InstalledEventScriptView {
  id: string;
  packId: string;
  name: string;
  definitionJson: string;
  enabled: boolean;
  createdAt: string;
}

interface InstalledEventScriptRow {
  id: string;
  pack_id: string;
  name: string;
  definition_json: string;
  enabled: number;
  created_at: string;
}

function mapRow(row: InstalledEventScriptRow): InstalledEventScriptView {
  return {
    id: row.id,
    packId: row.pack_id,
    name: row.name,
    definitionJson: row.definition_json,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

/** v2.11：能力包安装的声明式事件剧本（表由迁移 v040 建立） */
export function createInstalledEventScriptRepository(db: DatabaseInstance) {
  return {
    create(input: {
      id: string;
      packId: string;
      name: string;
      definitionJson: string;
    }): InstalledEventScriptView {
      db.prepare(
        `INSERT INTO installed_event_scripts(id, pack_id, name, definition_json, enabled, created_at)
         VALUES (@id, @packId, @name, @definitionJson, 1, @ts)`,
      ).run({ ...input, ts: nowIso() });
      return this.get(input.id)!;
    },

    get(id: string): InstalledEventScriptView | null {
      const row = db
        .prepare('SELECT * FROM installed_event_scripts WHERE id = ?')
        .get(id) as InstalledEventScriptRow | undefined;
      return row ? mapRow(row) : null;
    },

    /** v2.12：按来源能力包查找（禁用态 effectRef 为空时用于快照） */
    getByPackId(packId: string): InstalledEventScriptView | null {
      const row = db
        .prepare('SELECT * FROM installed_event_scripts WHERE pack_id = ? ORDER BY created_at ASC LIMIT 1')
        .get(packId) as InstalledEventScriptRow | undefined;
      return row ? mapRow(row) : null;
    },

    /** v2.12：升级替换定义与名称；启用标记由服务层决定（保持原状态） */
    replaceDefinition(
      id: string,
      input: { name: string; definitionJson: string; enabled: boolean },
    ): InstalledEventScriptView | null {
      const result = db
        .prepare(
          `UPDATE installed_event_scripts
           SET name = @name, definition_json = @definitionJson, enabled = @enabled
           WHERE id = @id`,
        )
        .run({ id, ...input, enabled: input.enabled ? 1 : 0 });
      return result.changes > 0 ? this.get(id) : null;
    },

    listAll(): InstalledEventScriptView[] {
      const rows = db
        .prepare('SELECT * FROM installed_event_scripts ORDER BY created_at DESC')
        .all() as InstalledEventScriptRow[];
      return rows.map(mapRow);
    },

    listEnabled(): InstalledEventScriptView[] {
      const rows = db
        .prepare('SELECT * FROM installed_event_scripts WHERE enabled = 1 ORDER BY created_at ASC')
        .all() as InstalledEventScriptRow[];
      return rows.map(mapRow);
    },

    setEnabled(id: string, enabled: boolean): void {
      db.prepare('UPDATE installed_event_scripts SET enabled = ? WHERE id = ?').run(
        enabled ? 1 : 0,
        id,
      );
    },

    remove(id: string): void {
      db.prepare('DELETE FROM installed_event_scripts WHERE id = ?').run(id);
    },
  };
}

export type InstalledEventScriptRepository = ReturnType<
  typeof createInstalledEventScriptRepository
>;
