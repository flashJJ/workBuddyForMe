import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { createDatabase } from '../client';

describe('v025 迁移：event_triggers 自定义短语触发器', () => {
  it('全新空库：表与索引就位，user_version=25', () => {
    const db = createDatabase(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(28);
    expect(LATEST_SCHEMA_VERSION).toBe(28);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_triggers'`)
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_etrig_assistant'`)
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
    db.close();
  });

  it('规则行可写；删除助手时级联删除', () => {
    const db = createDatabase(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO event_triggers(
         id, assistant_id, event_id, phrases_json, cooldown_ms, start_hour, end_hour,
         max_per_day, min_intimacy, enabled, created_at, updated_at)
       VALUES ('t1','a1','ev.relation.praised','["真棒"]',3600000,8,23,3,10,1,'t','t')`,
    ).run();

    const row = db.prepare(`SELECT * FROM event_triggers WHERE id='t1'`).get() as Record<
      string,
      unknown
    >;
    expect(row.phrases_json).toBe('["真棒"]');
    expect(row.min_intimacy).toBe(10);

    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    const left = db.prepare(`SELECT COUNT(*) AS n FROM event_triggers`).get() as { n: number };
    expect(left.n).toBe(0);
    db.close();
  });

  it('幂等：重复执行不报错', () => {
    const db = createDatabase(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    db.close();
  });
});
