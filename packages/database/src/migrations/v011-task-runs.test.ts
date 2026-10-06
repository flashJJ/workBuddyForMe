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
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v10 的库（含一条助手+会话供外键） */
function createV10Database(): Database.Database {
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
  db.pragma('user_version = 10');
  const ts = '2026-09-30T00:00:00.000Z';
  db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
  ).run(ts, ts);
  return db;
}

describe('v011 迁移：任务 Agent 循环（task_runs + task_steps）', () => {
  it('v10 老库升级：两表可写，级联删除生效', () => {
    const db = createV10Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([11, 12, 13, 14]);
    expect(LATEST_SCHEMA_VERSION).toBe(14);

    const ts = '2026-09-30T01:00:00.000Z';
    db.prepare(
      `INSERT INTO task_runs(id, conversation_id, assistant_id, goal, status, created_at, updated_at)
       VALUES ('r1', 'c1', 'a1', '打开记事本写一段话', 'running', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO task_steps(id, run_id, step_index, kind, tool_name, reason, created_at)
       VALUES ('s1', 'r1', 1, 'action', 'app_launch', '先启动记事本', ?)`,
    ).run(ts);

    const run = db.prepare(`SELECT * FROM task_runs WHERE id='r1'`).get() as {
      status: string;
      max_steps: number;
      stop_reason: string | null;
    };
    expect(run.status).toBe('running');
    expect(run.max_steps).toBe(20);
    expect(run.stop_reason).toBeNull();

    const step = db.prepare(`SELECT * FROM task_steps WHERE id='s1'`).get() as {
      kind: string;
      tool_name: string;
      status: string;
    };
    expect(step.kind).toBe('action');
    expect(step.tool_name).toBe('app_launch');
    expect(step.status).toBe('running');

    // 会话删除级联清掉运行与步骤
    db.prepare(`DELETE FROM conversations WHERE id='c1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM task_runs`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM task_steps`).get()).toEqual({ n: 0 });
    db.close();
  });

  it('user_version 门控：已升级到 v11 的库不重复应用', () => {
    const db = createV10Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
