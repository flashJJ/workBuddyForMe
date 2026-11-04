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

describe('v045 迁移：分支会话表', () => {
  it('全新库：版本 45、conversation_branches 与索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(45);
    expect(LATEST_SCHEMA_VERSION).toBe(45);
    expect(tables(db).has('conversation_branches')).toBe(true);

    const indexes = new Set(
      (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    expect(indexes.has('idx_conversation_branches_child')).toBe(true);
    expect(indexes.has('idx_conversation_branches_parent_status')).toBe(true);
    expect(indexes.has('idx_conversation_branches_root')).toBe(true);
    db.close();
  });

  it('旧库升级：44 → 45 只建表，旧会话不变', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 44);
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
       VALUES ('c1', 'a1', 'T', 't', 't')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([45]);
    expect(getSchemaVersion(db)).toBe(45);
    expect(tables(db).has('conversation_branches')).toBe(true);
    db.close();
  });

  it('状态 CHECK 与子会话唯一约束生效', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
    ).run();
    for (const id of ['p1', 'c1', 'c2']) {
      db.prepare(
        `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
         VALUES (?, 'a1', ?, 't', 't')`,
      ).run(id, id);
    }
    const insert = db.prepare(
      `INSERT INTO conversation_branches(
         id, parent_conversation_id, child_conversation_id, root_conversation_id,
         title, goal, status, depth, created_at, updated_at
       ) VALUES (?, 'p1', ?, 'p1', '分支', '目标', ?, 2, 't', 't')`,
    );
    insert.run('b1', 'c1', 'queued');
    expect(() => insert.run('b2', 'c1', 'queued')).toThrow();
    expect(() => insert.run('b3', 'c2', 'done')).toThrow();
    db.close();
  });
});
