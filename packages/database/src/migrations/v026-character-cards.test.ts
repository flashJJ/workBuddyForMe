import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v25 的库（表结构只欠 v026） */
function createV25Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 25');
  return db;
}

describe('v026 迁移：character_cards + assistants.card_id', () => {
  it('全新空库：user_version=26，character_cards 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(26);
    expect(LATEST_SCHEMA_VERSION).toBe(26);
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='character_cards'`)
      .all() as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    db.close();
  });

  it('assistants 新增 card_id 列，老行默认 NULL', () => {
    const db = createV25Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(26);

    const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('card_id');

    const row = db
      .prepare(`SELECT card_id AS cardId FROM assistants WHERE id='a1'`)
      .get() as { cardId: string | null };
    expect(row.cardId).toBeNull();

    db.prepare(`UPDATE assistants SET card_id='capable-colleague' WHERE id='a1'`).run();
    const updated = db
      .prepare(`SELECT card_id AS cardId FROM assistants WHERE id='a1'`)
      .get() as { cardId: string | null };
    expect(updated.cardId).toBe('capable-colleague');
    db.close();
  });

  it('character_cards 约束：source CHECK、可存原文与解析 JSON', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO character_cards(id,source,name,raw_markdown,parsed_json,default_emotion,created_at,updated_at)
       VALUES ('c1','custom','我的卡','---\nname: 我的卡\n---','{"name":"我的卡"}','joy','t','t')`,
    ).run();
    const row = db
      .prepare(`SELECT source, name, default_emotion AS e FROM character_cards WHERE id='c1'`)
      .get() as { source: string; name: string; e: string };
    expect(row).toEqual({ source: 'custom', name: '我的卡', e: 'joy' });

    expect(() =>
      db
        .prepare(
          `INSERT INTO character_cards(id,source,name,raw_markdown,parsed_json,created_at,updated_at)
           VALUES ('c2','bogus','x','m','{}','t','t')`,
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it('idx_cards_source 索引存在且迁移幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cards_source'`)
      .all() as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(26);
    db.close();
  });
});
