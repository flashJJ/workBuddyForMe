import type { Database } from 'better-sqlite3';

/**
 * v4.7 P1：协作运行检查点与续跑关联（版本 53，纯加法）。
 *
 * 1. task_run_checkpoints：每次规划/执行/审查后 upsert 一份快照，
 *    用于应用重启后判断「是否可续跑」并还原当前轮的子任务与交付物。
 * 2. agent_runs.resumed_from_run_id：续跑产生的新 run 指回旧 run，
 *    上下文装配据此补一段「上次运行停在何处」的说明。
 */
export function migrateV053(db: Database): void {
  // 部分测试夹具直接改 user_version 构造「老库」，实际没有 agent_runs；
  // 真实 v52 库一定已有该表。缺表时跳过（与 v052 的兼容策略一致）。
  const runTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'")
    .get();
  if (!runTable) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_run_checkpoints (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL DEFAULT 0,
      phase TEXT NOT NULL,
      subtask_json TEXT,
      outcome_json TEXT,
      budget_json TEXT NOT NULL,
      resumable INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_task_run_checkpoints_resumable
       ON task_run_checkpoints(resumable, updated_at DESC)`,
  );

  const columns = db.prepare('PRAGMA table_info(agent_runs)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'resumed_from_run_id')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN resumed_from_run_id TEXT');
  }
}
