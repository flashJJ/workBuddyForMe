import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v22 的库：结构只差 emotion_events */
function createV22Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 22');
  return db;
}

describe('v023 迁移：emotion_events 情绪事件流水', () => {
  it('全新空库：user_version=23，表与索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(36);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='emotion_events'`)
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_emotion_events_assistant'`)
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
    db.close();
  });

  it('v22 存量库升级：流水表可写，外键级联/置空生效', () => {
    const db = createV22Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const now = '2026-10-12T08:00:00.000Z';
    db.prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,created_at)
       VALUES('e1','a1','praise','model','joy',0.7,?)`,
    ).run(now);
    const row = db.prepare(`SELECT type, source, emotion, intensity FROM emotion_events WHERE id='e1'`).get() as {
      type: string;
      source: string;
      emotion: string;
      intensity: number;
    };
    expect(row).toEqual({ type: 'praise', source: 'model', emotion: 'joy', intensity: 0.7 });

    // 消息外键：消息删除时 message_id 置空
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,created_at,updated_at) VALUES('c1','a1',?,?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES('m1','c1','user','hi',?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,message_id,created_at)
       VALUES('e2','a1','chat','rule','m1',?)`,
    ).run(now);
    db.prepare(`DELETE FROM messages WHERE id='m1'`).run();
    const e2 = db.prepare(`SELECT message_id AS mid FROM emotion_events WHERE id='e2'`).get() as {
      mid: string | null;
    };
    expect(e2.mid).toBeNull();

    // 助手级联删除
    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM emotion_events`).get() as { n: number };
    expect(remaining.n).toBe(0);
    db.close();
  });

  it('迁移幂等：重复执行 v023 不报错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    db.close();
  });
});
