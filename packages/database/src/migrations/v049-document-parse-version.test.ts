import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function insertDocument(db: Database.Database, id: string, withBlock: boolean): void {
  db.prepare(
    `INSERT OR IGNORE INTO knowledge_bases
       (id, name, description, chunk_size, chunk_overlap, created_at, updated_at)
     VALUES ('kb1', '知识库', '', 800, 100, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run();
  db.prepare(
    `INSERT INTO documents
       (id, knowledge_base_id, filename, file_type, byte_size, content_hash, status, created_at)
     VALUES (?, 'kb1', 'a.md', 'md', 10, ?, 'indexed', '2026-01-01T00:00:00.000Z')`,
  ).run(id, `hash-${id}`);
  if (!withBlock) return;
  db.prepare(
    `INSERT INTO document_blocks
       (document_id, ordinal, kind, page_no, section_path, content, char_start, char_end, created_at)
     VALUES (?, 0, 'paragraph', NULL, '[]', '正文', 0, 2, '2026-01-01T00:00:00.000Z')`,
  ).run(id);
}

function parseVersion(db: Database.Database, id: string): number {
  return (
    db.prepare(`SELECT parse_version AS v FROM documents WHERE id = ?`).get(id) as {
      v: number;
    }
  ).v;
}

describe('v049 迁移：文档解析版本', () => {
  it('全新库：版本 49，parse_version 默认为 0', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(51);
    expect(LATEST_SCHEMA_VERSION).toBe(51);
    db.close();
  });

  it('旧库升级：仅有结构块的文档回填为 1，其余保持 0', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 48);
    insertDocument(db, 'with-block', true);
    insertDocument(db, 'legacy', false);

    const result = applyMigrations(db);
    expect(result.applied).toEqual([49, 50, 51]);
    expect(parseVersion(db, 'with-block')).toBe(1);
    expect(parseVersion(db, 'legacy')).toBe(0);
    db.close();
  });

  it('重复执行安全：回填不会把无结构块文档误升为 1', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 48);
    insertDocument(db, 'legacy', false);
    applyMigrations(db);
    applyMigrations(db);
    expect(parseVersion(db, 'legacy')).toBe(0);
    db.close();
  });
});
