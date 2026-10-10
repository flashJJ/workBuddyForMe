import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v16 的库：全量迁移后手动降版本（表结构已最新，模拟待升级老库只差 v017） */
function createV16Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 16');
  return db;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

describe('v017 迁移：chunk 坐标/FTS/知识编译三表/编译状态', () => {
  it('全新空库：user_version=17，全部新结构存在', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(17);
    expect(LATEST_SCHEMA_VERSION).toBe(17);

    const chunkCols = tableColumns(db, 'document_chunks');
    expect(chunkCols.has('page_no')).toBe(true);
    expect(chunkCols.has('paragraph_no')).toBe(true);

    const docCols = tableColumns(db, 'documents');
    for (const c of ['compile_generation', 'compiled_at', 'compile_status', 'compile_error']) {
      expect(docCols.has(c)).toBe(true);
    }

    const fts = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'`)
      .get() as { name?: string };
    expect(fts?.name).toBe('chunks_fts');
    for (const t of ['document_summaries', 'knowledge_entities', 'knowledge_entity_mentions']) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(t) as { name?: string };
      expect(row?.name).toBe(t);
    }
  });

  it('老 chunk 行坐标默认 NULL，检索/插入不受影响（读兼容）', () => {
    const db = createV16Database();
    db.prepare(
      `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb','k','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
       VALUES('d','kb','f.pdf','pdf',1,'h','t')`,
    ).run();
    db.prepare(
      `INSERT INTO document_chunks(document_id,ordinal,content,created_at) VALUES('d',0,'旧分片','t')`,
    ).run();

    applyMigrations(db);

    const row = db
      .prepare(`SELECT page_no AS pageNo, paragraph_no AS paragraphNo FROM document_chunks`)
      .get() as { pageNo: number | null; paragraphNo: number | null };
    expect(row.pageNo).toBeNull();
    expect(row.paragraphNo).toBeNull();

    // 新坐标列可写入
    db.prepare(`UPDATE document_chunks SET page_no=2, paragraph_no=5 WHERE document_id='d'`).run();
    const updated = db
      .prepare(`SELECT page_no AS p, paragraph_no AS pp FROM document_chunks`)
      .get() as { p: number; pp: number };
    expect(updated).toEqual({ p: 2, pp: 5 });
  });

  it('chunks_fts 建表为空且可用 unicode61（uni-gram 写入后中文 2 字词可查）', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n,
    ).toBe(0);

    db.prepare(`INSERT INTO chunks_fts(content, chunk_id, kb_id) VALUES(?, 1, 'kb')`).run(
      '混 合 检 索',
    );
    const hit = db
      .prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?`)
      .all('"混" OR "合"') as Array<{ chunk_id: number }>;
    expect(hit).toHaveLength(1);
    expect(hit[0]!.chunk_id).toBe(1);
  });

  it('documents 编译状态默认 skipped/世代 0（未编译回落 chunk-only）', () => {
    const db = createV16Database();
    db.prepare(
      `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb','k','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
       VALUES('d','kb','f','txt',1,'h','t')`,
    ).run();

    applyMigrations(db);

    const row = db
      .prepare(
        `SELECT compile_status AS status, compile_generation AS gen, compiled_at AS at,
                compile_error AS err FROM documents`,
      )
      .get() as { status: string; gen: number; at: string | null; err: string | null };
    expect(row).toEqual({ status: 'skipped', gen: 0, at: null, err: null });
  });

  it('幂等：重复执行 v017 不报错且不重复加列', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(17);
  });
});
