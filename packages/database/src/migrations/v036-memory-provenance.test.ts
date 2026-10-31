import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v036 迁移：memories 溯源字段与召回计数', () => {
  it('全新空库：user_version=latest，列与索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(42);

    const columns = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['source_message_id', 'recall_count']),
    );
    const idx = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memories_source_message'`,
      )
      .all() as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
    db.close();
  });

  it('旧数据默认值：未写来源消息的记忆 source_message_id=NULL、recall_count=0', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO memories(kind, content, importance, source_conversation_id, status,
         created_at, updated_at)
       VALUES ('fact', '旧记忆', 0.5, 'c-old', 'active', 't', 't')`,
    ).run();
    const row = db
      .prepare(`SELECT source_message_id, recall_count FROM memories WHERE content='旧记忆'`)
      .get() as { source_message_id: string | null; recall_count: number };
    expect(row).toEqual({ source_message_id: null, recall_count: 0 });
    db.close();
  });

  it('幂等：重复执行不报错，已有溯源数据不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO memories(kind, content, importance, source_message_id, recall_count,
         status, created_at, updated_at)
       VALUES ('fact', '带来源', 0.5, 'msg-1', 3, 'active', 't', 't')`,
    ).run();
    expect(() => applyMigrations(db)).not.toThrow();
    const row = db
      .prepare(`SELECT source_message_id, recall_count FROM memories WHERE content='带来源'`)
      .get() as { source_message_id: string; recall_count: number };
    expect(row).toEqual({ source_message_id: 'msg-1', recall_count: 3 });
    db.close();
  });
});
