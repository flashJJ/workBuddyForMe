import type { Database } from 'better-sqlite3';

/**
 * v1.8 迁移（版本 26）：角色卡库（纯加法，见 docs/plan/v1.8/04）。
 *
 * 1. character_cards：Markdown 角色卡（内置只读卡 + 用户自建/导入卡），
 *    原文 raw_markdown 与解析结果 parsed_json 双份存储；
 * 2. assistants.card_id：当前选用的卡；NULL=默认卡。
 *    故意不加外键约束：删卡时应用层把引用置空，内置卡升级/换 id 不阻断。
 *
 * 全部 IF NOT EXISTS / 列存在性守卫，重复执行幂等。
 */
export function migrateV026(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_cards (
      id              TEXT PRIMARY KEY,
      source          TEXT NOT NULL CHECK (source IN ('builtin','custom')),
      name            TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      raw_markdown    TEXT NOT NULL,
      parsed_json     TEXT NOT NULL,
      default_emotion TEXT NOT NULL DEFAULT 'neutral',
      voice           TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_source ON character_cards(source);
  `);

  const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'card_id')) {
    db.exec(`ALTER TABLE assistants ADD COLUMN card_id TEXT`);
  }
}
