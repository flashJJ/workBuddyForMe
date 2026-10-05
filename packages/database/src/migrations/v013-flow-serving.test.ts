import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { migrateV006 } from './v006-memory';
import { migrateV007 } from './v007-message-feedback';
import { migrateV008 } from './v008-mcp-servers';
import { migrateV009 } from './v009-tool-permissions';
import { migrateV010 } from './v010-skills-state';
import { migrateV011 } from './v011-task-runs';
import { migrateV012 } from './v012-flow-studio';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v12 的库 */
function createV12Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  migrateV005(db);
  migrateV006(db);
  migrateV007(db);
  migrateV008(db);
  migrateV009(db);
  migrateV010(db);
  migrateV011(db);
  migrateV012(db);
  db.pragma('user_version = 12');
  return db;
}

const TS = '2026-10-05T02:00:00.000Z';

describe('v013 迁移：Flow Serving（endpoints 表 + runs 增列）', () => {
  it('v12 老库升级：新表可写、runs 四增列 NULL、老数据不动', () => {
    const db = createV12Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([13]);
    expect(LATEST_SCHEMA_VERSION).toBe(13);

    db.prepare(
      `INSERT INTO workflows(id, name, status, current_version, created_at, updated_at)
       VALUES ('w1', '摘要器', 'published', 1, ?, ?)`,
    ).run(TS, TS);
    // 旧形态 INSERT（不提供 v013 新列）必须成功，新列为 NULL
    db.prepare(
      `INSERT INTO workflow_runs(id, workflow_id, version, trigger, status, created_at)
       VALUES ('r1', 'w1', 1, 'manual', 'running', ?)`,
    ).run(TS);

    db.prepare(
      `INSERT INTO workflow_endpoints
         (id, workflow_id, key_hash, key_prefix, created_at, updated_at)
       VALUES ('e1', 'w1', 'hash-x', 'wfk_abcd1234', ?, ?)`,
    ).run(TS, TS);

    const run = db.prepare(`SELECT * FROM workflow_runs WHERE id='r1'`).get() as Record<
      string,
      unknown
    >;
    expect(run.endpoint_id).toBeNull();
    expect(run.parent_run_id).toBeNull();
    expect(run.resumed_from_node).toBeNull();
    expect(run.interrupt_reason).toBeNull();

    const ep = db.prepare(`SELECT * FROM workflow_endpoints WHERE id='e1'`).get() as Record<
      string,
      unknown
    >;
    expect(ep.http_enabled).toBe(0);
    expect(ep.policy_mode).toBe('deny_all');
    expect(ep.status).toBe('enabled');
    expect(ep.sync_timeout_ms).toBe(60_000);
    db.close();
  });

  it('一流程仅允许一个端点（workflow_id UNIQUE）', () => {
    const db = createV12Database();
    applyMigrations(db);
    db.prepare(
      `INSERT INTO workflows(id, name, status, current_version, created_at, updated_at)
       VALUES ('w1', 'x', 'published', 1, ?, ?)`,
    ).run(TS, TS);
    const insert = () =>
      db
        .prepare(
          `INSERT INTO workflow_endpoints(id, workflow_id, key_hash, key_prefix, created_at, updated_at)
           VALUES (?, 'w1', ?, ?, ?, ?)`,
        )
        .run(newId(), newId(), 'p', TS, TS);
    insert();
    expect(insert).toThrow();
    db.close();
  });

  it('重复迁移不重复应用（user_version 门控）', () => {
    const db = createV12Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});

let counter = 0;
function newId(): string {
  counter += 1;
  return `id-${counter}`;
}
