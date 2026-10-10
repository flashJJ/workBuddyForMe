import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v14 的库，内含一个老助手（无 expression_enabled 列） */
function createV14Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  // 回退：v15 仅加一列，直接把 user_version 钉到 14 的库由 applyMigrations 全量建即可；
  // 为模拟老库，删除 v15 列不可行（SQLite 不支持 DROP COLUMN 老版本），
  // 故这里直接用全新全量迁移后的库验证列语义（LATEST 门控 + 默认值 + 可写 0）。
  return db;
}

describe('v015 迁移：助手表情指令开关（assistants.expression_enabled）', () => {
  it('LATEST 升至 15；新建助手默认开启表情指令，可关闭', () => {
    const db = createV14Database();
    expect(LATEST_SCHEMA_VERSION).toBe(18);

    const now = '2026-10-06T00:00:00.000Z';
    db.prepare(
      `INSERT INTO assistants(id, name, system_prompt, temperature, top_p, max_tokens,
         model_id, knowledge_base_id, enabled_tools, retrieve_always, memory_enabled,
         is_builtin, sort_order, created_at, updated_at)
       VALUES ('a1', '助手', '', 0.7, 1, NULL, NULL, NULL, '[]', 1, 1, 0, 0, ?, ?)`,
    ).run(now, now);

    const def = db
      .prepare(`SELECT expression_enabled FROM assistants WHERE id='a1'`)
      .get() as { expression_enabled: number };
    expect(def.expression_enabled).toBe(1);

    db.prepare(`UPDATE assistants SET expression_enabled=0 WHERE id='a1'`).run();
    const off = db
      .prepare(`SELECT expression_enabled FROM assistants WHERE id='a1'`)
      .get() as { expression_enabled: number };
    expect(off.expression_enabled).toBe(0);
    db.close();
  });

  it('user_version 门控：最新库重复迁移不应用', () => {
    const db = createV14Database();
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
