import type { Database } from 'better-sqlite3';

/**
 * v034：助手级技能（v2.4 M4 / P1-2，纯加法）
 *
 * 给 assistants 增加 skill_names JSON 数组列，承载「这个助手勾选了哪些技能」：
 * - 空数组 = 跟随全局：使用设置页里全部已启用技能（与 v2.3 行为完全一致，无需回填）；
 * - 非空 = 只注入这些技能（仍要求技能在设置页全局启用，停用即回收）。
 *
 * 幂等：迁移测试会把 user_version 回退后重跑，故先检查列再 ALTER。
 */
export function migrateV034(db: Database): void {
  // 迁移测试会用「空库 + 手动抬高 user_version」模拟老库，此时 assistants 尚不存在；
  // 真实顺序迁移由 v001 建表，故表缺失时直接跳过（与 v033 的处理一致）。
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistants'")
    .get();
  if (!table) return;

  const existing = new Set(
    (db.prepare('PRAGMA table_info(assistants)').all() as Array<{ name: string }>).map(
      (col) => col.name,
    ),
  );
  if (!existing.has('skill_names')) {
    db.exec(`ALTER TABLE assistants ADD COLUMN skill_names TEXT NOT NULL DEFAULT '[]'`);
  }
}
