import type { Database } from 'better-sqlite3';

/**
 * v031：.wbfm-pack mod 包安装记录表（v2.0 M5）
 * 仅登记导入事实（packId/名称/版本/作者/导入时间/条目摘要），不做级联删除内容：
 * 卸载包只清记录，已导入内容即独立本机数据（见 05 §2.2）。
 * 重复导入同一 pack_id 登记多行；id 随机生成不做唯一约束。
 */
export function migrateV031(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mod_installs (
      id           TEXT PRIMARY KEY,
      pack_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      author_name  TEXT,
      imported_at  TEXT NOT NULL,
      summary_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_mod_installs_pack ON mod_installs(pack_id);
  `);
}
