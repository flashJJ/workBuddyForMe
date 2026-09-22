import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v3 的库，内含一份老文档（无 OCR 列） */
function createV3Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  db.pragma('user_version = 3');
  const now = '2025-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO knowledge_bases(id, name, created_at, updated_at) VALUES ('kb1', '库', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO documents(id, knowledge_base_id, filename, file_type, byte_size, content_hash,
       status, source, created_at)
     VALUES ('d1', 'kb1', 'scan.pdf', '.pdf', 10, 'h1', 'indexed', 'upload', ?)`,
  ).run(now);
  return db;
}

describe('v004 迁移：documents OCR 字段加法升级', () => {
  it('v3 老库升级：老文档 ocr 两列为 NULL，可写入引擎与状态', () => {
    const db = createV3Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([4]);
    expect(LATEST_SCHEMA_VERSION).toBe(4);

    const before = db
      .prepare(`SELECT ocr_status, ocr_engine FROM documents WHERE id='d1'`)
      .get() as { ocr_status: string | null; ocr_engine: string | null };
    expect(before.ocr_status).toBeNull();
    expect(before.ocr_engine).toBeNull();

    db.prepare(
      `UPDATE documents SET ocr_status='done', ocr_engine='vision' WHERE id='d1'`,
    ).run();
    const after = db
      .prepare(`SELECT ocr_status, ocr_engine FROM documents WHERE id='d1'`)
      .get() as { ocr_status: string; ocr_engine: string };
    expect(after).toEqual({ ocr_status: 'done', ocr_engine: 'vision' });
    db.close();
  });

  it('user_version 门控：已升级到 v4 的库不重复应用', () => {
    const db = createV3Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
