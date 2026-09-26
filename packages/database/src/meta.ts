import type { DatabaseInstance } from './client';

/**
 * meta 表极简 KV 访问（schema 版本、向量维度、后台任务时间戳等单值标记）。
 * 值统一存字符串，调用方自行解析。
 */
export function getMeta(db: DatabaseInstance, key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setMeta(db: DatabaseInstance, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
