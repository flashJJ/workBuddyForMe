import type { Database } from 'better-sqlite3';

/**
 * v033：待机动作的段与档位（v2.2 M0，纯加法）
 *
 * 给 v032 的 motion_assets 补四列，承载「策略层」维度：
 * - entry_key：动作条目键，同键多个 clip 组成一个三段式动作；NULL 表示自成条目；
 * - segment：段标记（single / a_start / b_loop / c_end）；
 * - mood：情绪档位（good / normal / low）；
 * - min_relationship_level：最低关系等级门槛（0-3），NULL 表示无门槛。
 *
 * 旧行降级路径：single + normal + 无门槛 —— 即「整段即循环段、任何档位都可播」，
 * 与 v2.1 的行为完全一致，不需要回填。
 *
 * 幂等：仓库的迁移测试会「全量迁移后把 user_version 回退」来模拟老库，
 * 于是同一个迁移可能在已具备新列的表上再跑一次；因此逐列检查后再 ALTER，
 * 表不存在时直接跳过（正常顺序下 v032 已先建表）。
 */
export function migrateV033(db: Database): void {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='motion_assets'")
    .get();
  if (!table) return;

  const existing = new Set(
    (db.prepare('PRAGMA table_info(motion_assets)').all() as Array<{ name: string }>).map(
      (col) => col.name,
    ),
  );

  const additions: Array<[string, string]> = [
    ['entry_key', 'TEXT'],
    ['segment', "TEXT NOT NULL DEFAULT 'single'"],
    ['mood', "TEXT NOT NULL DEFAULT 'normal'"],
    ['min_relationship_level', 'INTEGER'],
  ];
  for (const [name, declaration] of additions) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE motion_assets ADD COLUMN ${name} ${declaration}`);
    }
  }
}
