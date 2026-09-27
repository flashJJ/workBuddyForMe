import type { Database } from 'better-sqlite3';

/**
 * v0.6 M3 本地技能包迁移（版本 10）。只做加法：
 * - skills_state：技能启停引用。技能本体是数据根 skills/<name>/ 文件夹 + skill.json；
 *   本表只持久化「启用状态 + 源路径引用」，删除行 ≠ 删除源文件夹；
 * - name 唯一（= 文件夹名，亦作 API 引用键）。
 */
export function migrateV010(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills_state (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      source_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_state_name ON skills_state(name)`);
}
