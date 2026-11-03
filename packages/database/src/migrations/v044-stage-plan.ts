import type { Database } from 'better-sqlite3';

/**
 * v2.20 M4 阶段计划迁移（版本 44，纯加法）：
 * - conversation_stage_plans：每个会话一行完整 StagePlan（activeStep 不单独建列）；
 * - assistants.stage_plan_json：助手显式默认阶段；
 * - character_cards.stage_plan_json：内置角色卡默认阶段；
 * - conversations.model_id：会话级模型覆盖。
 *
 * 只做 CREATE TABLE IF NOT EXISTS / ADD COLUMN，不重建表；旧行默认 NULL。
 */
export function migrateV044(db: Database): void {
  const tableExists = (name: string) =>
    Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name),
    );
  const hasColumn = (table: string, name: string) => {
    if (!tableExists(table)) return true;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return columns.some((column) => column.name === name);
  };

  if (tableExists('conversations')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_stage_plans (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  if (!hasColumn('assistants', 'stage_plan_json')) {
    db.exec(`ALTER TABLE assistants ADD COLUMN stage_plan_json TEXT`);
  }
  if (!hasColumn('character_cards', 'stage_plan_json')) {
    db.exec(`ALTER TABLE character_cards ADD COLUMN stage_plan_json TEXT`);
  }
  if (!hasColumn('conversations', 'model_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN model_id TEXT REFERENCES models(id) ON DELETE SET NULL`);
  }
}
