import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v4 的库，内含一份老会话（无摘要列） */
function createV4Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  db.pragma('user_version = 4');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO assistants(id, name, system_prompt, temperature, top_p, max_tokens,
       model_id, knowledge_base_id, enabled_tools, retrieve_always, is_builtin, sort_order,
       created_at, updated_at)
     VALUES ('a1', '助手', '', 0.7, 1, NULL, NULL, NULL, '[]', 0, 1, 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, last_message_at, created_at, updated_at)
     VALUES ('c1', 'a1', '老会话', NULL, ?, ?)`,
  ).run(now, now);
  return db;
}

describe('v005 迁移：conversations 摘要字段加法升级', () => {
  it('v4 老库升级：老会话 summary 为 NULL、summary_turns 为 0，可写回', () => {
    const db = createV4Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(LATEST_SCHEMA_VERSION).toBe(14);

    const before = db
      .prepare(`SELECT summary, summary_turns FROM conversations WHERE id='c1'`)
      .get() as { summary: string | null; summary_turns: number };
    expect(before).toEqual({ summary: null, summary_turns: 0 });

    db.prepare(
      `UPDATE conversations SET summary='用户偏好要点', summary_turns=6 WHERE id='c1'`,
    ).run();
    const after = db
      .prepare(`SELECT summary, summary_turns FROM conversations WHERE id='c1'`)
      .get() as { summary: string; summary_turns: number };
    expect(after).toEqual({ summary: '用户偏好要点', summary_turns: 6 });
    db.close();
  });

  it('user_version 门控：已升级到最新的库不重复应用', () => {
    const db = createV4Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
