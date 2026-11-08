import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function columns(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
}

describe('v044 迁移：阶段计划与模型字段', () => {
  it('全新库：版本 45、阶段表与三处加列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(48);
    expect(LATEST_SCHEMA_VERSION).toBe(48);

    const tables = new Set(
      (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    expect(tables.has('conversation_stage_plans')).toBe(true);

    expect(columns(db, 'assistants').has('stage_plan_json')).toBe(true);
    expect(columns(db, 'character_cards').has('stage_plan_json')).toBe(true);
    expect(columns(db, 'conversations').has('model_id')).toBe(true);
    db.close();
  });

  it('旧库升级：只加列/建表，旧行保持 NULL', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 43);
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
       VALUES ('c1', 'a1', 'T', 't', 't')`,
    ).run();
    db.prepare(
      `INSERT INTO character_cards(id, source, name, description, raw_markdown, parsed_json, default_emotion, created_at, updated_at)
       VALUES ('card1', 'custom', 'C', '', '# x', '{"name":"C","description":"","defaultEmotion":"neutral","voice":null,"identity":"","traits":[],"speakingStyle":[],"boundaries":[]}', 'neutral', 't', 't')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([44, 45, 46, 47, 48]);
    expect(getSchemaVersion(db)).toBe(48);

    const conversation = db
      .prepare(`SELECT model_id FROM conversations WHERE id = 'c1'`)
      .get() as { model_id: string | null };
    const assistant = db
      .prepare(`SELECT stage_plan_json FROM assistants WHERE id = 'a1'`)
      .get() as { stage_plan_json: string | null };
    const card = db
      .prepare(`SELECT stage_plan_json FROM character_cards WHERE id = 'card1'`)
      .get() as { stage_plan_json: string | null };
    expect(conversation.model_id).toBeNull();
    expect(assistant.stage_plan_json).toBeNull();
    expect(card.stage_plan_json).toBeNull();
    db.close();
  });
});
