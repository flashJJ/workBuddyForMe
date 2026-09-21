import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v2 的库，内含一条老消息与一份老文档 */
function createV2Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  db.pragma('user_version = 2');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO knowledge_bases(id, name, created_at, updated_at) VALUES ('kb1', '库', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO assistants(id, name, is_builtin, sort_order, created_at, updated_at)
     VALUES ('a1', '助手', 1, 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, created_at, updated_at) VALUES ('c1', 'a1', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO messages(id, conversation_id, role, content, created_at)
     VALUES ('m1', 'c1', 'user', '老消息', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO documents(id, knowledge_base_id, filename, file_type, byte_size, content_hash,
       status, created_at)
     VALUES ('d1', 'kb1', 'notes.txt', '.txt', 10, 'h1', 'indexed', ?)`,
  ).run(now);
  return db;
}

describe('v003 迁移：多模态字段加法升级', () => {
  it('v2 老库升级：attachments 表就位，老消息/老文档获得兼容默认值', () => {
    const db = createV2Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([3]);
    expect(LATEST_SCHEMA_VERSION).toBe(3);

    const message = db.prepare(`SELECT content_parts FROM messages WHERE id='m1'`).get() as {
      content_parts: string;
    };
    expect(JSON.parse(message.content_parts)).toEqual([]);

    const doc = db
      .prepare(`SELECT source, source_url FROM documents WHERE id='d1'`)
      .get() as { source: string; source_url: string | null };
    expect(doc.source).toBe('upload');
    expect(doc.source_url).toBeNull();

    // 新表可写可读
    db.prepare(
      `INSERT INTO attachments(id, filename, mime_type, byte_size, storage_path, content_hash,
         created_at) VALUES ('att1', 'a.png', 'image/png', 1, 'att1.png', 'hx', ?)`,
    ).run('2026-01-01T00:00:00.000Z');
    const att = db.prepare(`SELECT filename FROM attachments WHERE id='att1'`).get() as {
      filename: string;
    };
    expect(att.filename).toBe('a.png');
    db.close();
  });

  it('user_version 门控：已升级库不重复应用', () => {
    const db = createV2Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });

  it('直接对已升级库再跑 migrateV003 会因重复列报错（只允许 runner 前向调用）', () => {
    const db = createV2Database();
    migrateV003(db);
    expect(() => migrateV003(db)).toThrow(/duplicate (column|table name)|already exists/i);
    db.close();
  });
});
