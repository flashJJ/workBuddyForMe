import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { migrateV006 } from './v006-memory';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v6 的库，内含一条老消息（无 feedback 列） */
function createV6Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  migrateV005(db);
  migrateV006(db);
  db.pragma('user_version = 6');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO assistants(id, name, system_prompt, temperature, top_p, max_tokens,
       model_id, knowledge_base_id, enabled_tools, retrieve_always, is_builtin, sort_order,
       created_at, updated_at)
     VALUES ('a1', '助手', '', 0.7, 1, NULL, NULL, NULL, '[]', 0, 1, 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
     VALUES ('c1', 'a1', '会话', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO messages(id, conversation_id, role, content, status, citations,
       tool_trace, content_parts, created_at)
     VALUES ('m1', 'c1', 'assistant', '你好', 'completed', '[]', '[]', '[]', ?)`,
  ).run(now);
  return db;
}

describe('v007 迁移：消息反馈字段', () => {
  it('v6 老库升级：老消息 feedback 两列为 NULL，可写回 up/down', () => {
    const db = createV6Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(LATEST_SCHEMA_VERSION).toBe(15);

    const before = db.prepare(`SELECT feedback, feedback_at FROM messages WHERE id='m1'`).get() as {
      feedback: string | null;
      feedback_at: string | null;
    };
    expect(before.feedback).toBeNull();
    expect(before.feedback_at).toBeNull();

    db.prepare(
      `UPDATE messages SET feedback = 'up', feedback_at = ? WHERE id = 'm1'`,
    ).run('2025-02-01T00:00:00.000Z');
    const after = db.prepare(`SELECT feedback FROM messages WHERE id='m1'`).get() as {
      feedback: string;
    };
    expect(after.feedback).toBe('up');
    db.close();
  });
});
