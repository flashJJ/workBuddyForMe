import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function tables(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{
      name: string;
    }>).map((row) => row.name),
  );
}

function columns(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
}

describe('v047 迁移：结构化事实与任务检查点', () => {
  it('全新库：版本 49，两张表与索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(50);
    expect(LATEST_SCHEMA_VERSION).toBe(50);

    expect(tables(db).has('conversation_facts')).toBe(true);
    expect(tables(db).has('task_checkpoints')).toBe(true);
    for (const name of [
      'conversation_id',
      'kind',
      'key',
      'value',
      'unit',
      'valid_from',
      'source_message_ids',
      'checksum',
    ]) {
      expect(columns(db, 'conversation_facts').has(name)).toBe(true);
    }
    for (const name of [
      'conversation_id',
      'status',
      'goal',
      'plan',
      'todos_json',
      'last_tool_summary',
      'next_step',
      'expires_at',
    ]) {
      expect(columns(db, 'task_checkpoints').has(name)).toBe(true);
    }
    const indexes = new Set(
      (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    expect(indexes.has('idx_conversation_facts_conversation')).toBe(true);
    expect(indexes.has('idx_task_checkpoints_active')).toBe(true);
    db.close();
  });

  it('旧库升级：46 → 最新版本仅新增空表，存量记忆不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 46);
    db.prepare(
      `INSERT INTO memories(kind, content, importance, status, created_at, updated_at)
       VALUES ('fact', '用户住在杭州', 0.7, 'active', 't1', 't1')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([47, 48, 49, 50]);
    expect(getSchemaVersion(db)).toBe(50);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM conversation_facts`).get() as { n: number }).n,
    ).toBe(0);
    expect(
      (db.prepare(`SELECT content FROM memories`).get() as { content: string }).content,
    ).toBe('用户住在杭州');
    db.close();
  });

  it('同一会话同一 (kind,key) 唯一，不同会话可复用 key', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const insert = db.prepare(
      `INSERT INTO conversation_facts(conversation_id, kind, key, value, checksum, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 't', 't')`,
    );
    insert.run('c1', 'fact', 'budget', '5000', 'x1');
    insert.run('c2', 'fact', 'budget', '8000', 'x2');
    expect(() => insert.run('c1', 'fact', 'budget', '6000', 'x3')).toThrow();
    db.close();
  });
});
