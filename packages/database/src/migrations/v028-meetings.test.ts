import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v028 迁移：meetings + meeting_messages', () => {
  it('全新空库：user_version=28，两张表就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(39);
    for (const table of ['meetings', 'meeting_messages']) {
      const rows = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .all(table) as Array<{ name: string }>;
      expect(rows).toHaveLength(1);
    }
    // seq 索引就位
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_meeting_msg'`)
      .all() as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
    db.close();
  });

  it('停在 v27 的老库可平滑升级，stage_scenes 等老表不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.pragma('user_version = 27');
    expect(
      (
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stage_scenes'`)
          .all() as unknown[]
      ).length,
    ).toBe(1);

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(
      (
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_messages'`)
          .all() as unknown[]
      ).length,
    ).toBe(1);
    db.close();
  });

  it('幂等：重复执行不报错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('默认值与形状：mode=manual/status=active/auto_rounds=0，消息行可存取', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO meetings(id,topic,member_ids,created_at) VALUES('m1','评审',?,'t')`,
    ).run(JSON.stringify(['a', 'b']));
    const m = db
      .prepare(`SELECT mode, status, auto_rounds AS r, model_id AS mid, finished_at AS f FROM meetings WHERE id='m1'`)
      .get() as { mode: string; status: string; r: number; mid: string | null; f: string | null };
    expect(m).toMatchObject({ mode: 'manual', status: 'active', r: 0, mid: null, f: null });

    db.prepare(
      `INSERT INTO meeting_messages(id,meeting_id,seq,speaker_kind,speaker_id,speaker_name,content,created_at)
       VALUES('x1','m1',1,'assistant','a','阿策','观点','t')`,
    ).run();
    const msg = db
      .prepare(`SELECT speaker_kind AS k, speaker_id AS sid, truncated AS t FROM meeting_messages WHERE id='x1'`)
      .get() as { k: string; sid: string; t: number };
    expect(msg).toMatchObject({ k: 'assistant', sid: 'a', t: 0 });
    db.close();
  });
});
