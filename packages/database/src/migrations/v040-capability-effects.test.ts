import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v040 迁移：能力包 effect 支撑', () => {
  it('全新空库：三张新表与 workflows 来源列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(40);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    for (const table of ['installed_event_scripts', 'report_widgets', 'subagent_runs']) {
      expect(names).toContain(table);
    }

    const columns = db.prepare('PRAGMA table_info(workflows)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain('origin_capability_id');
    db.close();
  });

  it('v039 旧库升级：既有工作流/能力包数据不丢，新增列与表就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 39);
    expect(getSchemaVersion(db)).toBe(39);
    db.prepare(
      `INSERT INTO workflows(id, name, created_at, updated_at)
       VALUES ('wf-old', '旧工作流', 't', 't')`,
    ).run();
    db.prepare(
      `INSERT INTO capability_packs(
         id, kind, version, name, permissions_json, manifest_json, status, installed_at, updated_at)
       VALUES ('pack-old', 'skill', '1.0.0', '旧能力包', '[]', '{}', 'enabled', 't', 't')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([40]);
    expect(getSchemaVersion(db)).toBe(40);

    const workflow = db
      .prepare('SELECT id, name, origin_capability_id FROM workflows WHERE id = ?')
      .get('wf-old') as { id: string; name: string; origin_capability_id: string | null };
    expect(workflow).toEqual({ id: 'wf-old', name: '旧工作流', origin_capability_id: null });
    expect(
      (db.prepare('SELECT count(*) AS n FROM capability_packs').get() as { n: number }).n,
    ).toBe(1);
    for (const table of ['installed_event_scripts', 'report_widgets', 'subagent_runs']) {
      expect(
        (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
      ).toBe(0);
    }
    db.close();
  });

  it('行可写、重复迁移幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO installed_event_scripts(id, pack_id, name, definition_json, enabled, created_at)
       VALUES ('usr.test', 'com.test', '测试剧本', '{}', 1, 't')`,
    ).run();
    db.prepare(
      `INSERT INTO report_widgets(id, pack_id, title, config_json, enabled, created_at)
       VALUES ('widget-1', 'com.test', '测试卡片', '{}', 1, 't')`,
    ).run();
    db.prepare(
      `INSERT INTO subagent_runs(id, provider_id, goal, cwd, status, created_at)
       VALUES ('run-1', 'cli', '目标', '.', 'queued', 't')`,
    ).run();
    expect(() => applyMigrations(db)).not.toThrow();
    for (const table of ['installed_event_scripts', 'report_widgets', 'subagent_runs']) {
      expect(
        (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
      ).toBe(1);
    }
    db.close();
  });
});
