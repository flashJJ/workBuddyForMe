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
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v11 的库（workflow 表不依赖其他业务表，可直接在空业务库上验证） */
function createV11Database(): Database.Database {
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
  db.pragma('user_version = 11');
  return db;
}

describe('v012 迁移：Flow Studio（workflows 四表）', () => {
  it('v11 老库升级：四表可写，默认值与级联删除生效', () => {
    const db = createV11Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([12, 13, 14]);
    expect(LATEST_SCHEMA_VERSION).toBe(14);

    const ts = '2026-10-05T01:00:00.000Z';
    db.prepare(
      `INSERT INTO workflows(id, name, status, current_version, created_at, updated_at)
       VALUES ('w1', '周报流程', 'draft', 0, ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO workflow_versions(id, workflow_id, version, graph_json, created_at)
       VALUES ('v1', 'w1', 1, '{"nodes":[],"edges":[]}', ?)`,
    ).run(ts);
    db.prepare(
      `INSERT INTO workflow_runs(id, workflow_id, version, trigger, status, created_at, started_at)
       VALUES ('r1', 'w1', 1, 'manual', 'running', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO node_executions(id, run_id, node_id, status, started_at)
       VALUES ('n1', 'r1', 'start', 'running', ?)`,
    ).run(ts);

    const wf = db.prepare(`SELECT * FROM workflows WHERE id='w1'`).get() as {
      status: string;
      current_version: number;
      icon: string;
    };
    expect(wf.status).toBe('draft');
    expect(wf.current_version).toBe(0);
    expect(wf.icon).toBe('workflow');

    const run = db.prepare(`SELECT * FROM workflow_runs WHERE id='r1'`).get() as {
      trigger: string;
      wait_node_id: string | null;
    };
    expect(run.trigger).toBe('manual');
    expect(run.wait_node_id).toBeNull();

    const node = db.prepare(`SELECT * FROM node_executions WHERE id='n1'`).get() as {
      duration_ms: number;
      status: string;
    };
    expect(node.status).toBe('running');
    expect(node.duration_ms).toBe(0);

    // 版本号唯一约束：同 workflow 同版本不可重复
    expect(() =>
      db
        .prepare(
          `INSERT INTO workflow_versions(id, workflow_id, version, graph_json, created_at)
           VALUES ('v2', 'w1', 1, '{}', ?)`,
        )
        .run(ts),
    ).toThrow();

    // 工作流删除级联清掉版本、运行与节点执行
    db.prepare(`DELETE FROM workflows WHERE id='w1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM workflow_versions`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM workflow_runs`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM node_executions`).get()).toEqual({ n: 0 });
    db.close();
  });

  it('user_version 门控：已升级到 v12 的库不重复应用', () => {
    const db = createV11Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });

  it('全新库直接迁移到最新版本，四表存在', () => {
    const db = createV11Database();
    applyMigrations(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ['workflows', 'workflow_versions', 'workflow_runs', 'node_executions']) {
      expect(tables).toContain(t);
    }
    db.close();
  });
});
