import type { Database } from 'better-sqlite3';

/**
 * v2.10 能力包登记表（版本 39）。只做加法：
 * - capability_packs：清单摘要 + 状态 + effect 句柄 + 最近错误；
 * - 包文件本体在数据目录 capabilities/<id>/，记录只做索引。
 */
export function migrateV039(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS capability_packs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disabled',
      effect_ref TEXT,
      last_error TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
