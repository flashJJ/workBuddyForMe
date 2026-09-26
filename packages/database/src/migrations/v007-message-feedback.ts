import type { Database } from 'better-sqlite3';

/**
 * v0.5 P1-2 消息反馈迁移（版本 7）。只做加法：
 * - messages.feedback：'up' | 'down' | NULL（未评价/取消）；
 * - messages.feedback_at：反馈时间，取消时置 NULL。
 * 旧消息两列均为 NULL，等价于从未评价。
 */
export function migrateV007(db: Database): void {
  db.exec(`ALTER TABLE messages ADD COLUMN feedback TEXT`);
  db.exec(`ALTER TABLE messages ADD COLUMN feedback_at TEXT`);
}
