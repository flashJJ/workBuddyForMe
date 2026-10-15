import type { Database } from 'better-sqlite3';

/**
 * v1.9 迁移（版本 27）：舞台场景（见 docs/plan/v1.9/02 §6，纯加法）。
 *
 * stage_scenes：命名保存的舞台场景（背景/站位/cast 覆盖/显隐/滤镜）。
 * 背景图片不入库，文件复制到数据目录 stage-backgrounds/，payload 仅存 fileRef；
 * 备份默认只带引用不带图（恢复缺失回落默认背景）。
 *
 * IF NOT EXISTS 守卫，重复执行幂等；M1 无内置场景（is_builtin 恒 0，列先冻结）。
 */
export function migrateV027(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_scenes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      is_builtin   INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
  `);
}
