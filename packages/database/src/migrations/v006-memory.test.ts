import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v5 的库，内含一个老助手（无 memory_enabled 列） */
function createV5Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  migrateV005(db);
  db.pragma('user_version = 5');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO assistants(id, name, system_prompt, temperature, top_p, max_tokens,
       model_id, knowledge_base_id, enabled_tools, retrieve_always, is_builtin, sort_order,
       created_at, updated_at)
     VALUES ('a1', '助手', '', 0.7, 1, NULL, NULL, NULL, '[]', 0, 1, 0, ?, ?)`,
  ).run(now, now);
  return db;
}

describe('v006 迁移：长期记忆（assistants.memory_enabled + memories）', () => {
  it('v5 老库升级：老助手默认开启记忆，memories 表可写', () => {
    const db = createV5Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([6, 7, 8, 9]);
    expect(LATEST_SCHEMA_VERSION).toBe(9);

    const assistant = db
      .prepare(`SELECT memory_enabled FROM assistants WHERE id='a1'`)
      .get() as { memory_enabled: number };
    expect(assistant.memory_enabled).toBe(1);

    db.prepare(
      `INSERT INTO memories(kind, content, importance, source_conversation_id, status,
         created_at, updated_at)
       VALUES ('preference', '用户偏好中文回复', 0.8, 'c1', 'active',
         '2025-01-02T00:00:00.000Z', '2025-01-02T00:00:00.000Z')`,
    ).run();
    const memory = db
      .prepare(`SELECT id, kind, status, last_accessed_at FROM memories WHERE content=?`)
      .get('用户偏好中文回复') as {
      id: number;
      kind: string;
      status: string;
      last_accessed_at: string | null;
    };
    expect(memory.id).toBeGreaterThan(0);
    expect(memory.status).toBe('active');
    expect(memory.last_accessed_at).toBeNull();
    db.close();
  });

  it('user_version 门控：已升级到 v6 的库不重复应用', () => {
    const db = createV5Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
