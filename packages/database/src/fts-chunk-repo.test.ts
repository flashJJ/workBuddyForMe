import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './migrations/runner';
import { createFtsChunkRepository } from './fts-chunk-repo';

function seedKb(db: Database.Database): { kb: string; doc: string } {
  db.prepare(
    `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb1','库','t','t')`,
  ).run();
  db.prepare(
    `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
     VALUES('d1','kb1','f.txt','txt',1,'h','t')`,
  ).run();
  return { kb: 'kb1', doc: 'd1' };
}

describe('FTS 分片仓储（v1.3 M0）', () => {
  it('写入后中文 2 字词可经 matchChunkIds 命中（uni-gram 归一化）', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const { kb } = seedKb(db);
    const fts = createFtsChunkRepository(db);

    db.prepare(
      `INSERT INTO document_chunks(id,document_id,ordinal,content,created_at)
       VALUES (101,'d1',0,'知识编译层混合检索','t')`,
    ).run();
    fts.bulkInsert([{ chunkId: 101, knowledgeBaseId: kb, content: '知识编译层混合检索' }]);

    expect(fts.matchChunkIds(kb, '混合', 10)).toEqual([101]);
    expect(fts.matchChunkIds(kb, '编译层', 10)).toEqual([101]);
    // 型号/英文词
    expect(fts.matchChunkIds(kb, 'qwen', 10)).toEqual([]);
  });

  it('查询无有效 token（纯标点/空串）返回空数组且不抛错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const fts = createFtsChunkRepository(db);
    expect(fts.matchChunkIds('kb1', '///', 10)).toEqual([]);
    expect(fts.matchChunkIds('kb1', '', 10)).toEqual([]);
  });

  it('按文档删除后对应 FTS 行不残留，其他文档保留', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO knowledge_bases(id,name,created_at,updated_at) VALUES('kb1','库','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO documents(id,knowledge_base_id,filename,file_type,byte_size,content_hash,created_at)
       VALUES('d1','kb1','a.txt','txt',1,'h1','t'),('d2','kb1','b.txt','txt',1,'h2','t')`,
    ).run();
    const fts = createFtsChunkRepository(db);
    db.prepare(
      `INSERT INTO document_chunks(id,document_id,ordinal,content,created_at)
       VALUES (1,'d1',0,'苹果内容','t'),(2,'d2',0,'香蕉内容','t')`,
    ).run();
    fts.bulkInsert([
      { chunkId: 1, knowledgeBaseId: 'kb1', content: '苹果内容' },
      { chunkId: 2, knowledgeBaseId: 'kb1', content: '香蕉内容' },
    ]);

    fts.deleteByDocument('kb1', 'd1');
    expect(fts.matchChunkIds('kb1', '苹果', 10)).toEqual([]);
    expect(fts.matchChunkIds('kb1', '香蕉', 10)).toEqual([2]);
  });

  it('rebuild 全量重灌：清库后从 document_chunks 重建并返回索引条数', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const { kb } = seedKb(db);
    const fts = createFtsChunkRepository(db);
    db.prepare(
      `INSERT INTO document_chunks(id,document_id,ordinal,content,created_at)
       VALUES (101,'d1',0,'混合检索重排','t'),(102,'d1',1,'知识编译','t')`,
    ).run();
    // 先写再清空（模拟索引损坏/旧库懒重建）
    fts.bulkInsert([
      { chunkId: 101, knowledgeBaseId: kb, content: '混合检索重排' },
      { chunkId: 102, knowledgeBaseId: kb, content: '知识编译' },
    ]);
    fts.clear();
    expect(fts.matchChunkIds(kb, '混合', 10)).toEqual([]);

    const result = fts.rebuild();
    expect(result.indexed).toBe(2);
    expect(fts.matchChunkIds(kb, '混合', 10)).toEqual([101]);
    expect(fts.matchChunkIds(kb, '编译', 10)).toEqual([102]);
    // 幂等：再 rebuild 不重复
    expect(fts.rebuild().indexed).toBe(2);
  });
});
