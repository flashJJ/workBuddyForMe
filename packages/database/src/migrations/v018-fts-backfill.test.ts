import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion } from './runner';

/** 停在 v17 的库：全量迁移后手动降版本（结构已最新，模拟只差 v018 回填的存量库） */
function createV17DatabaseWithChunks(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.prepare(
    `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb','混合检索','t','t')`,
  ).run();
  db.prepare(
    `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
     VALUES('d','kb','笔记.txt','.txt',1,'h','t')`,
  ).run();
  // v017 前的存量分片：已在 document_chunks，但 chunks_fts 无行（v017 只建空表）
  db.prepare(
    `INSERT INTO document_chunks(document_id,ordinal,content,created_at)
     VALUES('d',0,'LangChain 混合检索与 RRF 融合','t'),('d',1,'知识编译器抽取实体','t')`,
  ).run();
  db.pragma('user_version = 17');
  return db;
}

describe('v018 迁移：chunks_fts 存量回填', () => {
  it('存量分片按 uni-gram 归一化回填，中文 2 字词与英文整词均可 MATCH', () => {
    const db = createV17DatabaseWithChunks();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n,
    ).toBe(0);

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(18);

    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n,
    ).toBe(2);

    const cn = db
      .prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH '"检" OR "索"'`)
      .all() as Array<{ chunk_id: number }>;
    expect(cn.map((r) => r.chunk_id)).toEqual([1]);

    const en = db
      .prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH '"langchain"'`)
      .all() as Array<{ chunk_id: number }>;
    expect(en.map((r) => r.chunk_id)).toEqual([1]);
  });

  it('已存在的 FTS 行不重复灌（幂等；v017 后新摄取分片摄取链路已写入）', () => {
    const db = createV17DatabaseWithChunks();
    // 模拟 chunk 1 已被摄取链路写入 FTS
    db.prepare(`INSERT INTO chunks_fts(content, chunk_id, kb_id) VALUES(?, 1, 'kb')`).run(
      'langchain 混 合 检 索 与 rrf 融 合',
    );

    applyMigrations(db);
    const rows = db
      .prepare(`SELECT chunk_id FROM chunks_fts ORDER BY chunk_id`)
      .all() as Array<{ chunk_id: number }>;
    expect(rows.map((r) => r.chunk_id)).toEqual([1, 2]);

    // 再跑一次迁移：零新增、无重复
    applyMigrations(db);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n,
    ).toBe(2);
  });

  it('全新空库：回填零行，版本直达 18', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(18);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n,
    ).toBe(0);
  });
});
