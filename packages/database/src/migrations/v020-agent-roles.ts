import type { Database } from 'better-sqlite3';

/**
 * v1.4 M2 迁移（版本 20）。纯加法/兼容放宽：
 *
 * 1. assistants 增加协作三角色模型覆盖列（均可空）：
 *    NULL = 回落顺序「助手通用 modelId → 系统默认对话模型」；
 *    存量助手回填 NULL，语义即「不覆盖」，读兼容。
 * 2. task_steps 增加 citations_json：action 步工具命中的引用（knowledge_search 等）
 *    落库，Executor 据此把证据收敛进 ExecutorOutcome.evidence（与对话 citations 同源）。
 *    存量步骤回填 ''（空串=无引用），桌面任务行为不变。
 * 3. task_runs.conversation_id 放宽为可空：Executor 子循环可由无会话入口发起
 *    （Flow agent 节点/直接 API）。SQLite 不能 ALTER 列约束，按官方 12 步
 *    简化法重建表（同事务 DROP+RENAME，子表外键按表名重新解析）；存量行全量复制。
 */
export function migrateV020(db: Database): void {
  const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  addColumnIfMissing(
    'assistants',
    'planner_model_id',
    `planner_model_id TEXT REFERENCES models(id) ON DELETE SET NULL`,
  );
  addColumnIfMissing(
    'assistants',
    'executor_model_id',
    `executor_model_id TEXT REFERENCES models(id) ON DELETE SET NULL`,
  );
  addColumnIfMissing(
    'assistants',
    'reviewer_model_id',
    `reviewer_model_id TEXT REFERENCES models(id) ON DELETE SET NULL`,
  );
  addColumnIfMissing(
    'task_steps',
    'citations_json',
    `citations_json TEXT NOT NULL DEFAULT ''`,
  );

  // ---- 3. task_runs 放宽 conversation_id 为可空（仅当旧版 NOT NULL 时重建） ----
  const taskRunCols = db.prepare(`PRAGMA table_info(task_runs)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const conversationCol = taskRunCols.find((c) => c.name === 'conversation_id');
  if (conversationCol?.notnull === 1) {
    db.exec(`
      CREATE TABLE task_runs_new (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
        assistant_id TEXT NOT NULL DEFAULT '',
        goal TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        step_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        max_steps INTEGER NOT NULL DEFAULT 20,
        stop_reason TEXT,
        agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
      INSERT INTO task_runs_new
        (id, conversation_id, assistant_id, goal, status, step_count, failure_count,
         max_steps, stop_reason, agent_run_id, created_at, updated_at, finished_at)
      SELECT id, conversation_id, assistant_id, goal, status, step_count, failure_count,
             max_steps, stop_reason, agent_run_id, created_at, updated_at, finished_at
      FROM task_runs;
      DROP TABLE task_runs;
      ALTER TABLE task_runs_new RENAME TO task_runs;
      CREATE INDEX IF NOT EXISTS idx_task_runs_conversation ON task_runs(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON task_runs(agent_run_id);
    `);
  }
}
