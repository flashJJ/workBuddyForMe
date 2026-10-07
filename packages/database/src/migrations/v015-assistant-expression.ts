import type { Database } from 'better-sqlite3';

/**
 * v1.0 M3 表情指令迁移（版本 15）。只做加法：
 * - assistants.expression_enabled：回复中允许插入 [joy] 等表情标签（驱动 Live2D），默认 1。
 * - 标签对纯文字用户不可见（客户端渲染剥离、TTS 不读、分享导出剥离）。
 */
export function migrateV015(db: Database): void {
  const columns = db.prepare(`PRAGMA table_info(assistants)`).all() as { name: string }[];
  if (columns.some((c) => c.name === 'expression_enabled')) return;
  db.exec(
    `ALTER TABLE assistants ADD COLUMN expression_enabled INTEGER NOT NULL DEFAULT 1`,
  );
}
