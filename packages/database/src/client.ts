import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { ensureDataDirs, getDatabasePath } from '@wbfm/config';
import { applyMigrations } from './migrations/runner';

export type { DatabaseInstance };

/** 创建一个已配置 pragma、向量扩展与迁移的数据库实例（测试可用 :memory:） */
export function createDatabase(filename = ':memory:'): DatabaseInstance {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  sqliteVec.load(db);
  applyMigrations(db);
  return db;
}

let singleton: DatabaseInstance | null = null;

/** 初始化默认文件数据库单例（数据根来自 @wbfm/config） */
export function initDatabase(): DatabaseInstance {
  if (singleton) return singleton;
  ensureDataDirs();
  singleton = createDatabase(getDatabasePath());
  return singleton;
}

export function getDatabase(): DatabaseInstance {
  if (!singleton) throw new Error('数据库尚未初始化，请先调用 initDatabase()');
  return singleton;
}

export function closeDatabase(): void {
  singleton?.close();
  singleton = null;
}

/** 仅供测试：替换单例（测试框架在临时库上驱动服务层） */
export function __setDatabaseForTest(db: DatabaseInstance | null): void {
  singleton = db;
}
