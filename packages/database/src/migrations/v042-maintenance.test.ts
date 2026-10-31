import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV042 } from './v042-maintenance';

function insertWorkflow(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO workflows(id, name, status, current_version, created_at, updated_at)
     VALUES (?, ?, 'published', 3, 't', 't')`,
  ).run(id, id);
}

function insertVersion(
  db: Database.Database,
  workflowId: string,
  version: number,
  publishedAt: string | null,
): void {
  db.prepare(
    `INSERT INTO workflow_versions(id, workflow_id, version, graph_json, published_at, created_at)
     VALUES (?, ?, ?, '{}', ?, 't')`,
  ).run(`${workflowId}-v${version}`, workflowId, version, publishedAt);
}

describe('v042 迁移：可维护底座', () => {
  it('全新库：skill_versions / active_version / published_version 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(42);
    expect(LATEST_SCHEMA_VERSION).toBe(42);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toContain('skill_versions');

    const skillColumns = db.prepare('PRAGMA table_info(skills_state)').all() as Array<{
      name: string;
    }>;
    expect(skillColumns.map((column) => column.name)).toContain('active_version');

    const workflowColumns = db.prepare('PRAGMA table_info(workflows)').all() as Array<{
      name: string;
    }>;
    expect(workflowColumns.map((column) => column.name)).toContain('published_version');
    db.close();
  });

  it('v41 旧库升级：保留技能状态，按历史发布回填生产版本', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 41);
    db.prepare(
      `INSERT INTO skills_state(id, name, enabled, source_path, created_at, updated_at)
       VALUES ('sk1', 'weekly-report', 0, '/data/skills/weekly-report', 't', 't')`,
    ).run();
    insertWorkflow(db, 'wf-published');
    insertVersion(db, 'wf-published', 1, '2026-01-01T00:00:00.000Z');
    insertVersion(db, 'wf-published', 2, '2026-02-01T00:00:00.000Z');
    insertVersion(db, 'wf-published', 3, null);
    insertWorkflow(db, 'wf-draft');
    db.prepare(
      `UPDATE workflows SET status = 'draft', current_version = 1 WHERE id = 'wf-draft'`,
    ).run();
    insertVersion(db, 'wf-draft', 1, null);

    const result = applyMigrations(db);
    expect(result.applied).toEqual([42]);
    expect(getSchemaVersion(db)).toBe(42);

    const published = db
      .prepare('SELECT published_version FROM workflows WHERE id = ?')
      .get('wf-published') as { published_version: number | null };
    expect(published.published_version).toBe(2);

    const draft = db
      .prepare('SELECT published_version FROM workflows WHERE id = ?')
      .get('wf-draft') as { published_version: number | null };
    expect(draft.published_version).toBeNull();

    const skill = db
      .prepare('SELECT enabled, active_version FROM skills_state WHERE id = ?')
      .get('sk1') as { enabled: number; active_version: string | null };
    expect(skill.enabled).toBe(0);
    expect(skill.active_version).toBeNull();
    db.close();
  });

  it('重复执行 v042 幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    migrateV042(db);
    expect(() => migrateV042(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(42);
    db.close();
  });
});
