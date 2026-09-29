import type { Database } from 'better-sqlite3';

/**
 * v0.7 M3 任务 Agent 循环迁移（版本 11）。只做加法：
 * - task_runs：一次任务运行（目标、状态机、步数/失败计数、终止原因）；
 * - task_steps：逐步行动日志（观察截图引用 attachments 相对路径不入库，
 *   决策理由 + 工具参数/结果 JSON + 耗时），供任务时间线与回放。
 */
export function migrateV011(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      assistant_id TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      step_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      max_steps INTEGER NOT NULL DEFAULT 20,
      stop_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_task_runs_conversation ON task_runs(conversation_id, created_at DESC)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      kind TEXT NOT NULL,
      tool_name TEXT,
      reason TEXT NOT NULL DEFAULT '',
      args_json TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '',
      screenshot_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'running',
      error TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_steps_run ON task_steps(run_id, step_index ASC)`);
}
