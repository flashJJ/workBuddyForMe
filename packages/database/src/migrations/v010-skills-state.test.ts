import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { migrateV006 } from './v006-memory';
import { migrateV007 } from './v007-message-feedback';
import { migrateV008 } from './v008-mcp-servers';
import { migrateV009 } from './v009-tool-permissions';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v9 的库 */
function createV9Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  migrateV005(db);
  migrateV006(db);
  migrateV007(db);
  migrateV008(db);
  migrateV009(db);
  db.pragma('user_version = 9');
  return db;
}

describe('v010 迁移：技能包状态（skills_state）', () => {
  it('v9 老库升级：表可写，name 唯一', () => {
    const db = createV9Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([10, 11, 12]);
    expect(LATEST_SCHEMA_VERSION).toBe(12);

    const ts = '2026-09-27T00:00:00.000Z';
    db.prepare(
      `INSERT INTO skills_state(id, name, enabled, source_path, created_at, updated_at)
       VALUES ('sk1', 'weekly-report', 1, '/data/skills/weekly-report', ?, ?)`,
    ).run(ts, ts);
    const row = db.prepare(`SELECT * FROM skills_state WHERE id='sk1'`).get() as {
      enabled: number;
      source_path: string;
    };
    expect(row.enabled).toBe(1);
    expect(row.source_path).toBe('/data/skills/weekly-report');

    // 同名技能被唯一索引拒绝
    expect(() =>
      db
        .prepare(
          `INSERT INTO skills_state(id, name, created_at, updated_at)
           VALUES ('sk2', 'weekly-report', ?, ?)`,
        )
        .run(ts, ts),
    ).toThrow();
    db.close();
  });

  it('user_version 门控：已升级到 v10 的库不重复应用', () => {
    const db = createV9Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
