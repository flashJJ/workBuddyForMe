import type { Database } from 'better-sqlite3';

/**
 * v2.8 持久作业 / 计划 / 定时跟进迁移（版本 37）。只做加法：
 * - task_runs / agent_runs：lease_owner + lease_expires_at（重启后识别幽灵 running）；
 * - run_completions：完成回投幂等键（同一运行只追加一次助手消息）；
 * - conversation_goals / work_plans / work_plan_steps：目标、计划、待办；
 * - scheduled_tasks.payload_json：定时跟进携带 conversationId/planId/runId。
 * 旧数据无需回填；payload_json 为空即 v1.7 的普通提醒。
 */
export function migrateV037(db: Database): void {
  addLeaseColumns(db, 'task_runs');
  addLeaseColumns(db, 'agent_runs');

  db.exec(`
    CREATE TABLE IF NOT EXISTS run_completions (
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, kind)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_goals (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      success_criteria TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_goals_conversation ON conversation_goals(conversation_id, created_at DESC)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS work_plans (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      goal_id TEXT,
      kind TEXT NOT NULL DEFAULT 'plan',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      origin TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_work_plans_conversation ON work_plans(conversation_id, created_at DESC)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS work_plan_steps (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_work_plan_steps_plan ON work_plan_steps(plan_id, step_index ASC)`,
  );

  addPayloadColumn(db);
}

/** 租约列：表不存在（局部测试库）时跳过 */
function addLeaseColumns(db: Database, table: string): void {
  if (!tableExists(db, table)) return;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const has = (name: string) => columns.some((column) => column.name === name);
  if (!has('lease_owner')) db.exec(`ALTER TABLE ${table} ADD COLUMN lease_owner TEXT`);
  if (!has('lease_expires_at')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN lease_expires_at TEXT`);
  }
}

function addPayloadColumn(db: Database): void {
  if (!tableExists(db, 'scheduled_tasks')) return;
  const columns = db.prepare(`PRAGMA table_info(scheduled_tasks)`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'payload_json')) {
    db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN payload_json TEXT`);
  }
}

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}
