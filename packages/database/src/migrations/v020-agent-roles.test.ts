import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v19 的库：结构只差 v020 */
function createV19Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 19');
  return db;
}

function columnNames(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name),
  );
}

describe('v020 迁移：助手三角色模型列 + task_steps 引用列', () => {
  it('全新空库：user_version=20，四个新列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(36);
    const assistantCols = columnNames(db, 'assistants');
    expect(assistantCols.has('planner_model_id')).toBe(true);
    expect(assistantCols.has('executor_model_id')).toBe(true);
    expect(assistantCols.has('reviewer_model_id')).toBe(true);
    expect(columnNames(db, 'task_steps').has('citations_json')).toBe(true);
  });

  it('v19 存量库升级：旧助手三角色列回填 NULL；旧步骤 citations_json 为空串', () => {
    const db = createV19Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','T','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,created_at,updated_at)
       VALUES('tr','c','g','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_steps(id,run_id,step_index,kind,created_at)
       VALUES('ts','tr',0,'observe','t')`,
    ).run();

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const assistant = db
      .prepare(
        `SELECT planner_model_id AS p, executor_model_id AS e, reviewer_model_id AS r
         FROM assistants WHERE id='a'`,
      )
      .get() as { p: string | null; e: string | null; r: string | null };
    expect(assistant).toEqual({ p: null, e: null, r: null });

    const step = db
      .prepare(`SELECT citations_json AS c FROM task_steps WHERE id='ts'`)
      .get() as { c: string };
    expect(step.c).toBe('');
  });

  it('迁移幂等：重复执行不报错、不重复加列', () => {
    const db = createV19Database();
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    const cols = columnNames(db, 'assistants');
    expect(['planner_model_id', 'executor_model_id', 'reviewer_model_id'].every((c) => cols.has(c)))
      .toBe(true);
  });

  it('task_runs 重建：conversation_id 放宽可空，存量行保留，子表外键级联仍生效', () => {
    const db = createV19Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','T','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,created_at,updated_at)
       VALUES('tr','c','存量目标','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_steps(id,run_id,step_index,kind,created_at)
       VALUES('ts','tr',0,'observe','t')`,
    ).run();

    applyMigrations(db);

    const convCol = (db.prepare(`PRAGMA table_info(task_runs)`).all() as Array<{ name: string; notnull: number }>)
      .find((c) => c.name === 'conversation_id');
    expect(convCol?.notnull).toBe(0);

    // 存量行完整保留
    const kept = db.prepare(`SELECT conversation_id AS c, goal AS g FROM task_runs WHERE id='tr'`).get() as {
      c: string;
      g: string;
    };
    expect(kept).toEqual({ c: 'c', g: '存量目标' });
    const keptSteps = db.prepare(`SELECT COUNT(*) AS n FROM task_steps WHERE id='ts'`).get() as { n: number };
    expect(keptSteps.n).toBe(1);

    // 无会话入口可直接建行（Flow agent 节点场景）
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,created_at,updated_at)
       VALUES('tr2',NULL,'无会话目标','t','t')`,
    ).run();
    const orphan = db.prepare(`SELECT conversation_id AS c FROM task_runs WHERE id='tr2'`).get() as {
      c: string | null;
    };
    expect(orphan.c).toBeNull();

    // 子表外键级联未因重建而丢失
    db.prepare(`DELETE FROM task_runs WHERE id='tr'`).run();
    const childCount = db.prepare(`SELECT COUNT(*) AS n FROM task_steps WHERE id='ts'`).get() as {
      n: number;
    };
    expect(childCount.n).toBe(0);
  });

  it('写入闭环：角色覆盖列可独立设置；citations_json 随步读写', () => {
    const db = createV19Database();
    applyMigrations(db);
    db.prepare(
      `INSERT INTO providers(id,name,base_url,created_at,updated_at)
       VALUES('p1','供应','http://x','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO models(id,provider_id,model_id,display_name,created_at)
       VALUES('m1','p1','model-a','模型A','t'),('m2','p1','model-b','模型B','t')`,
    ).run();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `UPDATE assistants SET planner_model_id='m1', executor_model_id='m2' WHERE id='a'`,
    ).run();
    const row = db
      .prepare(`SELECT planner_model_id AS p, executor_model_id AS e, reviewer_model_id AS r
               FROM assistants WHERE id='a'`)
      .get() as { p: string; e: string; r: string | null };
    expect(row).toEqual({ p: 'm1', e: 'm2', r: null });

    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','T','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,created_at,updated_at)
       VALUES('tr','c','g','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_steps(id,run_id,step_index,kind,citations_json,created_at)
       VALUES('ts','tr',1,'action','[{"documentId":"d1"}]','t')`,
    ).run();
    const step = db
      .prepare(`SELECT citations_json AS c FROM task_steps WHERE id='ts'`)
      .get() as { c: string };
    expect(JSON.parse(step.c)).toEqual([{ documentId: 'd1' }]);
  });
});
