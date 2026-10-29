import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function ts(): string {
  return '2026-10-22T00:00:00.000Z';
}

/** 最小助手行（只填 NOT NULL 必需列，其余走列默认） */
function insertAssistant(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO assistants(id, name, system_prompt, temperature, top_p, enabled_tools, sort_order, created_at, updated_at)
     VALUES (?, '测试助手', '', 1, 1, '[]', 0, ?, ?)`,
  ).run(id, ts(), ts());
}

describe('v034 迁移：助手级技能（assistants.skill_names）', () => {
  it('新库即具备 skill_names 列，缺省空数组（= 跟随全局，与 v2.3 行为一致）', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    insertAssistant(db, 'a1');
    const row = db.prepare(`SELECT skill_names FROM assistants WHERE id='a1'`).get() as {
      skill_names: string;
    };
    expect(row.skill_names).toBe('[]');

    // 可写入并回读
    db.prepare(`UPDATE assistants SET skill_names = ? WHERE id='a1'`).run(
      JSON.stringify(['weekly-report']),
    );
    const updated = db.prepare(`SELECT skill_names FROM assistants WHERE id='a1'`).get() as {
      skill_names: string;
    };
    expect(JSON.parse(updated.skill_names)).toEqual(['weekly-report']);
    db.close();
  });

  it('user_version 回退到 33 重跑：只应用 v34 且不因列已存在报错（幂等）', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.pragma('user_version = 33');

    const again = applyMigrations(db);
    expect(again.applied).toEqual([34, 35, 36, 37, 38, 39]);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});
