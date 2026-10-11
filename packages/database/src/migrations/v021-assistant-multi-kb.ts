import type { Database } from 'better-sqlite3';

/**
 * v1.5 迁移（版本 21）：助手支持关联多个知识库。
 *
 * 1. assistants 增加 knowledge_base_ids TEXT（JSON 数组，与 enabled_tools 同构），
 *    存量助手回填 '[]'；
 * 2. 旧单列 knowledge_base_id 非空的行回填为单元素数组，语义零变化；
 *    旧列保留不读（避免 SQLite 重建表风险），新代码只写 knowledge_base_ids。
 * 3. Flow 节点多库配置存于 workflow_versions.graph JSON 内，无表结构变更。
 */
export function migrateV021(db: Database): void {
  const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'knowledge_base_ids')) {
    db.exec(`ALTER TABLE assistants ADD COLUMN knowledge_base_ids TEXT NOT NULL DEFAULT '[]'`);
  }
  // 回填独立于建列执行（老库可能已存在该列但数据未迁移）；仅动仍是空数组且
  // 旧单列非空的行，重复执行不会覆盖已配置的多库数据。
  db.exec(`
    UPDATE assistants
       SET knowledge_base_ids = json_array(knowledge_base_id)
     WHERE knowledge_base_id IS NOT NULL
       AND knowledge_base_ids = '[]'
  `);
}
