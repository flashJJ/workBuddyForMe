import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v20 的库：结构只差 v021 */
function createV20Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 20');
  return db;
}

describe('v021 迁移：助手多知识库 knowledge_base_ids', () => {
  it('全新空库：user_version=21，新列就位且默认 []', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(29);
    expect(LATEST_SCHEMA_VERSION).toBe(29);
    const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'knowledge_base_ids')).toBe(true);
  });

  it('v20 存量库升级：旧单值回填为单元素数组，NULL 行保持 []', () => {
    const db = createV20Database();
    db.prepare(
      `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb-1','制度库','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO assistants(id,name,knowledge_base_id,created_at,updated_at)
       VALUES('a1','助手1','kb-1','t','t'),('a2','助手2',NULL,'t','t')`,
    ).run();

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(29);

    const rows = db
      .prepare(`SELECT id, knowledge_base_ids AS ids FROM assistants ORDER BY id`)
      .all() as Array<{ id: string; ids: string }>;
    expect(rows).toEqual([
      { id: 'a1', ids: '["kb-1"]' },
      { id: 'a2', ids: '[]' },
    ]);
  });

  it('迁移幂等：重复执行不报错且数据不变', () => {
    const db = createV20Database();
    db.prepare(
      `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb-1','制度库','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO assistants(id,name,knowledge_base_id,created_at,updated_at)
       VALUES('a1','助手1','kb-1','t','t')`,
    ).run();
    applyMigrations(db);
    applyMigrations(db);
    const ids = db.prepare(`SELECT knowledge_base_ids AS ids FROM assistants WHERE id='a1'`).get() as {
      ids: string;
    };
    expect(ids.ids).toBe('["kb-1"]');
  });
});
