import type { Database } from 'better-sqlite3';

/**
 * v0.2 工具调用版本迁移（版本 2）。
 * 只做加法：新列均有默认值，旧库直接平滑升级。
 */

/**
 * 回填规则：
 * - assistants.enabled_tools 默认仅 current_time；
 *   已绑定知识库的老助手追加 knowledge_search，保证能力不回退。
 * - retrieve_always 默认 1（保留 v0.1 每轮强制检索行为一个版本，用户可手动关闭）。
 */
export function migrateV002(db: Database): void {
  db.exec(
    `ALTER TABLE assistants ADD COLUMN enabled_tools TEXT NOT NULL DEFAULT '["current_time"]'`,
  );
  db.exec(`ALTER TABLE assistants ADD COLUMN retrieve_always INTEGER NOT NULL DEFAULT 1`);
  db.exec(`ALTER TABLE messages ADD COLUMN tool_trace TEXT NOT NULL DEFAULT '[]'`);

  db.exec(
    `UPDATE assistants
       SET enabled_tools = '["current_time","knowledge_search"]'
     WHERE knowledge_base_id IS NOT NULL`,
  );
}
