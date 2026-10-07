import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV014 } from './v014-voice';

/** 构造停在 v13 的库（全量升级到 13 比手工逐版本更不容易漏） */
function createV13Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  // 回滚思路不适用（迁移只前向）；若当前已含 v14，则降级 user_version 并手工去表模拟旧库
  if (getSchemaVersion(db) >= 14) {
    db.exec('DROP TABLE IF EXISTS voice_models');
    db.pragma('user_version = 13');
  }
  return db;
}

const TS = '2026-10-06T04:00:00.000Z';

describe('v014 迁移：voice_models 下载状态表', () => {
  it('v13 老库升级到 14，新表约束与主键生效', () => {
    const db = createV13Database();
    expect(getSchemaVersion(db)).toBe(13);

    const result = applyMigrations(db);
    expect(result.applied).toEqual([14, 15]);
    expect(LATEST_SCHEMA_VERSION).toBe(15);

    db.prepare(
      `INSERT INTO voice_models(kind, model_id, status, bytes_total, bytes_done, updated_at)
       VALUES ('asr', 'sense-voice', 'downloading', 100, 40, ?)`,
    ).run(TS);

    // 同 kind+model_id 再写触发 ON CONFLICT 前先验证主键（直接 INSERT 应失败）
    expect(() =>
      db
        .prepare(
          `INSERT INTO voice_models(kind, model_id, status, updated_at)
           VALUES ('asr', 'sense-voice', 'ready', ?)`,
        )
        .run(TS),
    ).toThrow(/UNIQUE/);

    // CHECK 约束：非法 kind/status 拒绝
    expect(() =>
      db
        .prepare(
          `INSERT INTO voice_models(kind, model_id, status, updated_at)
           VALUES ('video', 'x', 'missing', ?)`,
        )
        .run(TS),
    ).toThrow(/CHECK/);

    // upsert 走 ON CONFLICT 更新
    db.prepare(
      `INSERT INTO voice_models(kind, model_id, status, bytes_total, bytes_done, updated_at)
       VALUES ('asr', 'sense-voice', 'ready', 100, 100, ?)
       ON CONFLICT(kind, model_id) DO UPDATE SET status=excluded.status,
         bytes_done=excluded.bytes_done, updated_at=excluded.updated_at`,
    ).run(TS);
    const row = db
      .prepare(`SELECT status, bytes_done FROM voice_models WHERE kind='asr' AND model_id='sense-voice'`)
      .get() as { status: string; bytes_done: number };
    expect(row).toEqual({ status: 'ready', bytes_done: 100 });
  });

  it('迁移幂等：v014 重复执行不报错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(15);
    expect(() => migrateV014(db)).not.toThrow();
  });
});

