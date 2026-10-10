import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v18 的库：全结构最新，模拟只差 v019 的存量库 */
function createV18Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 18');
  return db;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name) as { name?: string };
  return Boolean(row?.name);
}

function columnNames(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name),
  );
}

describe('v019 迁移：agent_runs/agent_handoffs 与归属列', () => {
  it('全新空库：user_version=19，新表与归属列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(19);
    expect(LATEST_SCHEMA_VERSION).toBe(19);
    expect(tableExists(db, 'agent_runs')).toBe(true);
    expect(tableExists(db, 'agent_handoffs')).toBe(true);
    expect(columnNames(db, 'task_runs').has('agent_run_id')).toBe(true);
    expect(columnNames(db, 'task_steps').has('agent_run_id')).toBe(true);
  });

  it('v18 存量库升级：表建成且 task 两表回填可空归属列（旧行 NULL，读兼容）', () => {
    const db = createV18Database();
    // 旧桌面任务（v011 结构），无 agent 归属
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','t','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,created_at,updated_at)
       VALUES('tr','c','目标','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_steps(id,run_id,step_index,kind,created_at)
       VALUES('ts','tr',0,'observe','t')`,
    ).run();

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(19);

    const run = db.prepare(`SELECT agent_run_id FROM task_runs WHERE id='tr'`).get() as {
      agent_run_id: string | null;
    };
    expect(run.agent_run_id).toBeNull();
    const step = db.prepare(`SELECT agent_run_id FROM task_steps WHERE id='ts'`).get() as {
      agent_run_id: string | null;
    };
    expect(step.agent_run_id).toBeNull();
  });

  it('迁移幂等：重复执行 v019 不报错、不重复加列', () => {
    const db = createV18Database();
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(
      (db.prepare(`PRAGMA table_info(task_runs)`).all() as unknown[]).filter(
        (c) => (c as { name: string }).name === 'agent_run_id',
      ),
    ).toHaveLength(1);
  });

  it('新表默认值与写入闭环（两入口 + 交接流水 + 归属）', () => {
    const db = createV18Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','t','t','t')`,
    ).run();
    applyMigrations(db);

    // 对话任务模式入口：flow_run_id/node_execution_id 可空，预算走 DDL 默认
    db.prepare(
      `INSERT INTO agent_runs(id,conversation_id,assistant_id,goal,created_at,updated_at)
       VALUES('ar1','c','a','目标','t','t')`,
    ).run();
    const row = db.prepare(`SELECT * FROM agent_runs WHERE id='ar1'`).get() as Record<
      string,
      unknown
    >;
    expect(row.flow_run_id).toBeNull();
    expect(row.max_rounds).toBe(3);
    expect(row.max_steps).toBe(20);
    expect(row.max_total_tokens).toBe(80000);
    expect(row.round_no).toBe(0);
    expect(row.total_tokens).toBe(0);
    expect(row.final_outcome).toBeNull();

    // 交接流水按轮次/序号写入
    db.prepare(
      `INSERT INTO agent_handoffs(id,run_id,round_no,seq,from_role,to_role,payload,created_at)
       VALUES('h1','ar1',0,0,'planner','executor','{"subtask":{}}','t')`,
    ).run();
    db.prepare(
      `INSERT INTO agent_handoffs(id,run_id,round_no,seq,from_role,to_role,payload,created_at)
       VALUES('h2','ar1',0,1,'executor','reviewer','{"outcome":{}}','t')`,
    ).run();
    const handoffs = db
      .prepare(`SELECT seq, from_role AS f, to_role AS t FROM agent_handoffs ORDER BY round_no, seq`)
      .all();
    expect(handoffs).toHaveLength(2);

    // task_run 归属协作运行
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,agent_run_id,created_at,updated_at)
       VALUES('tr2','c','子任务','ar1','t','t')`,
    ).run();
    const linked = db.prepare(`SELECT agent_run_id FROM task_runs WHERE id='tr2'`).get() as {
      agent_run_id: string;
    };
    expect(linked.agent_run_id).toBe('ar1');
  });

  it('FK 级联：删除 agent_run 时 handoffs 级联删除、task_runs 归属置空', () => {
    const db = createV18Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at)
       VALUES('c','a','t','t','t')`,
    ).run();
    applyMigrations(db);
    db.prepare(
      `INSERT INTO agent_runs(id,conversation_id,assistant_id,goal,created_at,updated_at)
       VALUES('ar','c','a','g','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO agent_handoffs(id,run_id,round_no,seq,from_role,to_role,payload,created_at)
       VALUES('h','ar',0,0,'planner','executor','{}','t')`,
    ).run();
    db.prepare(
      `INSERT INTO task_runs(id,conversation_id,goal,agent_run_id,created_at,updated_at)
       VALUES('tr','c','g','ar','t','t')`,
    ).run();

    db.prepare(`DELETE FROM agent_runs WHERE id='ar'`).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM agent_handoffs`).get() as { n: number }).n,
    ).toBe(0);
    const orphaned = db.prepare(`SELECT agent_run_id FROM task_runs WHERE id='tr'`).get() as {
      agent_run_id: string | null;
    };
    expect(orphaned.agent_run_id).toBeNull();
  });
});
