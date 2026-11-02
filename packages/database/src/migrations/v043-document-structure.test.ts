import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV043 } from './v043-document-structure';

function tableColumns(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
}

function tableNames(db: Database.Database): Set<string> {
  return new Set(
    (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );
}

function seedOldKnowledge(db: Database.Database): void {
  db.prepare(
    `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb','旧库','t','t')`,
  ).run();
  db.prepare(
    `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,status,created_at)
     VALUES('doc','kb','旧合同.pdf','pdf',1,'h','indexed','t')`,
  ).run();
  db.prepare(
    `INSERT INTO document_chunks(document_id,ordinal,content,char_start,char_end,page_no,created_at)
     VALUES('doc',0,'旧合同文本',0,5,3,'t')`,
  ).run();
}

describe('v043 迁移：文档结构块与知识关系', () => {
  it('全新库：版本 43、document_blocks/知识关系表与 chunks 结构列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(43);
    expect(LATEST_SCHEMA_VERSION).toBe(43);

    expect(tableNames(db)).toContain('document_blocks');
    expect(tableNames(db)).toContain('knowledge_relations');

    const columns = tableColumns(db, 'document_chunks');
    for (const name of [
      'section_path',
      'block_kind',
      'table_no',
      'table_row_start',
      'table_row_end',
    ]) {
      expect(columns.has(name)).toBe(true);
    }
    db.close();
  });

  it('v42 旧库升级：旧文档/分片行数不变，结构列默认空值且可正常查询', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 42);
    seedOldKnowledge(db);

    const before = db
      .prepare(`SELECT COUNT(*) AS n FROM document_chunks WHERE document_id='doc'`)
      .get() as { n: number };

    const result = applyMigrations(db);
    expect(result.applied).toEqual([43]);
    expect(getSchemaVersion(db)).toBe(43);

    const after = db
      .prepare(`SELECT COUNT(*) AS n FROM document_chunks WHERE document_id='doc'`)
      .get() as { n: number };
    expect(after.n).toBe(before.n);

    const chunk = db
      .prepare(
        `SELECT section_path AS path, block_kind AS kind, table_no AS tableNo,
                content, page_no AS pageNo
         FROM document_chunks WHERE document_id='doc'`,
      )
      .get() as {
      path: string;
      kind: string | null;
      tableNo: number | null;
      content: string;
      pageNo: number;
    };
    expect(chunk).toMatchObject({
      path: '[]',
      kind: null,
      tableNo: null,
      content: '旧合同文本',
      pageNo: 3,
    });
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM document_blocks`).get() as { n: number }).n,
    ).toBe(0);

    // 新结构列可写入，旧查询不受影响
    db.prepare(
      `UPDATE document_chunks SET section_path='["合同","付款条款"]', block_kind='table', table_no=1
       WHERE document_id='doc'`,
    ).run();
    const updated = db
      .prepare(`SELECT section_path AS path, block_kind AS kind FROM document_chunks`)
      .get() as { path: string; kind: string };
    expect(updated.kind).toBe('table');
    expect(JSON.parse(updated.path)).toEqual(['合同', '付款条款']);
    db.close();
  });

  it('document_blocks 可按文档写入/读取，文档删除级联清理', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    seedOldKnowledge(db);
    db.prepare(
      `INSERT INTO document_blocks
         (document_id, ordinal, kind, page_no, section_path, content, char_start, char_end, table_json, created_at)
       VALUES ('doc', 0, 'heading', 1, '["合同"]', '采购合同', 0, 4, NULL, 't'),
              ('doc', 1, 'table', 1, '["合同","付款条款"]', '| 阶段 | 比例 |', 6, 18, '{"tableNo":1,"header":["阶段","比例"],"rows":[["首付","30%"]]}', 't')`,
    ).run();
    const rows = db
      .prepare(
        `SELECT ordinal, kind, section_path AS path, table_json AS tableJson
         FROM document_blocks WHERE document_id='doc' ORDER BY ordinal`,
      )
      .all() as Array<{ ordinal: number; kind: string; path: string; tableJson: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows[1]!.kind).toBe('table');
    expect(JSON.parse(rows[1]!.tableJson!)).toMatchObject({ tableNo: 1 });

    db.prepare(`DELETE FROM documents WHERE id='doc'`).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM document_blocks`).get() as { n: number }).n,
    ).toBe(0);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM document_chunks`).get() as { n: number }).n,
    ).toBe(0);
    db.close();
  });

  it('重复执行 v043 幂等，不重复加列/建表', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => migrateV043(db)).not.toThrow();
    expect(() => migrateV043(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(43);
    db.close();
  });
});
