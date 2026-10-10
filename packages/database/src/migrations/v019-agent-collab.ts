import type { Database } from 'better-sqlite3';

// 预算默认值在迁移内冻结为字面量：即使将来 shared 的 AGENT_BUDGET_DEFAULTS
// 调整，已应用 v019 的库 DDL 默认值也不得随之漂移（迁移历史不可变）。
const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_MAX_STEPS = 20;
const DEFAULT_MAX_TOTAL_TOKENS = 80_000;

/**
 * v1.4 多智能体协作迁移（版本 19）。纯加法：
 *
 * 1. agent_runs：一次 Planner/Executor/Reviewer 协作运行。两个入口均可空关联：
 *    对话任务模式（conversation_id）与 Flow agent 节点（flow_run_id/
 *    node_execution_id）；预算三列创建时固化，终态/最终交付/错误信息齐全。
 * 2. agent_handoffs：角色交接流水（结构化 JSON 载荷），按轮次+序号有序，
 *    是泳道时间线、重放与 eval 断言的锚点。
 * 3. task_runs/task_steps 加可空 agent_run_id：Executor 走桌面 task-loop
 *    子循环时反向归属协作运行；普通桌面任务保持 NULL（读兼容）。
 */
export function migrateV019(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      flow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
      node_execution_id TEXT,
      assistant_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      round_no INTEGER NOT NULL DEFAULT 0,
      max_rounds INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_ROUNDS},
      max_steps INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_STEPS},
      max_total_tokens INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_TOTAL_TOKENS},
      final_outcome TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation ON agent_runs(conversation_id, created_at DESC)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_runs_flow ON agent_runs(flow_run_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, created_at DESC)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_handoffs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      from_role TEXT NOT NULL,
      to_role TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_handoffs_run ON agent_handoffs(run_id, round_no, seq)`,
  );

  // ---- 3. task_runs/task_steps 反向归属列（旧行回填 NULL，非协作任务恒 NULL） ----
  const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumnIfMissing(
    'task_runs',
    'agent_run_id',
    `agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL`,
  );
  addColumnIfMissing(
    'task_steps',
    'agent_run_id',
    `agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON task_runs(agent_run_id)`,
  );
}
