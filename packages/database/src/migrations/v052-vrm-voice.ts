import type { Database } from 'better-sqlite3';

/**
 * v052：导入 VRM 声线绑定（v4.6 M2）
 *
 * 只加可空列：旧库/旧备份升级后 voice_sid 为 NULL，合成时继续按默认角色回落，
 * 行为与升级前一致。范围 0–102 由应用层校验，不写 CHECK，避免 SQLite 重建表。
 */
export function migrateV052(db: Database): void {
  // 部分测试夹具会构造「只到 v30 之前」的库；真实 v51 库一定已有 vrm_avatars。
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vrm_avatars'")
    .get();
  if (!table) return;

  const columns = db.prepare('PRAGMA table_info(vrm_avatars)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'voice_sid')) {
    db.exec('ALTER TABLE vrm_avatars ADD COLUMN voice_sid INTEGER');
  }
}
