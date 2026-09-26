import type { Database } from 'better-sqlite3';

/**
 * v0.5 对话自动压缩迁移（版本 5）。只做加法：
 * - conversations.summary：较早轮次的递归摘要文本，NULL=未压缩；
 * - conversations.summary_turns：已折叠进摘要的最早消息条数（累计），默认 0。
 * 旧会话两列为 NULL/0，视为从未压缩，行为与 v0.4 完全一致。
 */
export function migrateV005(db: Database): void {
  db.exec(`ALTER TABLE conversations ADD COLUMN summary TEXT`);
  db.exec(`ALTER TABLE conversations ADD COLUMN summary_turns INTEGER NOT NULL DEFAULT 0`);
}
