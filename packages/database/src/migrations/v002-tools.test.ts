import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { applyMigrations } from './runner';

function createV1Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  db.pragma('user_version = 1');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO knowledge_bases(id, name, created_at, updated_at) VALUES ('kb-legacy', '老库', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO assistants(id, name, knowledge_base_id, is_builtin, sort_order, created_at, updated_at)
     VALUES ('a-plain', '无库助手', NULL, 1, 0, ?, ?),
            ('a-kb', '有库助手', 'kb-legacy', 0, 1, ?, ?)`,
  ).run(now, now, now, now);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, created_at, updated_at)
     VALUES ('c1', 'a-plain', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO messages(id, conversation_id, role, content, created_at)
     VALUES ('m1', 'c1', 'assistant', '历史回复', ?)`,
  ).run(now);
  return db;
}

describe('v002 迁移：工具调用字段加法升级', () => {
  it('v1 老库升级：新列就位，绑定 KB 的助手回填 knowledge_search', () => {
    const db = createV1Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([2]);

    const plain = db
      .prepare(`SELECT enabled_tools, retrieve_always FROM assistants WHERE id='a-plain'`)
      .get() as { enabled_tools: string; retrieve_always: number };
    const withKb = db
      .prepare(`SELECT enabled_tools, retrieve_always FROM assistants WHERE id='a-kb'`)
      .get() as { enabled_tools: string; retrieve_always: number };

    expect(JSON.parse(plain.enabled_tools)).toEqual(['current_time']);
    expect(plain.retrieve_always).toBe(1);
    expect(JSON.parse(withKb.enabled_tools)).toEqual(['current_time', 'knowledge_search']);

    // 老消息获得空 tool_trace 默认值，读取可直接 JSON.parse
    const message = db.prepare(`SELECT tool_trace FROM messages WHERE id='m1'`).get() as {
      tool_trace: string;
    };
    expect(JSON.parse(message.tool_trace)).toEqual([]);
    db.close();
  });

  it('重复执行 v2 列已存在时迁移整体不重复应用（user_version 门控）', () => {
    const db = createV1Database();
    applyMigrations(db);
    const second = applyMigrations(db);
    expect(second.applied).toEqual([]);
    db.close();
  });

  it('直接对已升级库再跑 migrateV002 会因重复列报错（只允许 runner 前向调用）', () => {
    const db = createV1Database();
    migrateV002(db);
    expect(() => migrateV002(db)).toThrow(/duplicate column/i);
    db.close();
  });
});
