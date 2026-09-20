import type { Database } from 'better-sqlite3';
import { migrateV001 } from './v001-initial-schema';

interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
}

/** 顺序迁移表：新版本在此追加，禁止修改已发布迁移 */
const MIGRATIONS: Migration[] = [
  { version: 1, description: 'initial schema', up: migrateV001 },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/**
 * 基于 PRAGMA user_version 的顺序迁移（前向、事务化、幂等）。
 * 迁移策略：读兼容、写收敛 —— 后续版本只做加法或兼容映射。
 */
export function applyMigrations(db: Database): { from: number; to: number; applied: number[] } {
  const from = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
  return { from, to: LATEST_SCHEMA_VERSION, applied: pending.map((m) => m.version) };
}

export function getSchemaVersion(db: Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}
