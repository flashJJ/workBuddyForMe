import { beforeEach, describe, expect, it } from 'vitest';
import { timestamps } from './utils/time';
import {
  createDatabase,
  deleteVectorsByDocument,
  ensureVectorTable,
  getVectorDimension,
  insertChunkVectors,
  normalizeVector,
  searchChunks,
  type DatabaseInstance,
} from './index';

/** 构造知识库→文档→分片夹具 */
function seedFixture(db: DatabaseInstance) {
  const ts = timestamps();
  db.prepare(
    `INSERT INTO knowledge_bases(id, name, description, chunk_size, chunk_overlap, created_at, updated_at)
     VALUES ('kb1', '测试库', '', 500, 80, @created_at, @updated_at)`,
  ).run(ts);
  db.prepare(
    `INSERT INTO documents(id, knowledge_base_id, filename, file_type, byte_size, content_hash,
       status, error_message, chunk_count, created_at, indexed_at)
     VALUES ('d1','kb1','a.md','.md',10,'h','indexed',NULL,3,@created_at,@created_at)`,
  ).run({ created_at: ts.created_at });
  const insertChunk = db.prepare(
    `INSERT INTO document_chunks(id, document_id, ordinal, content, char_start, char_end, created_at)
     VALUES (@id,'d1',@ordinal,@content,0,10,@created_at)`,
  );
  const chunks = [
    { id: 1, content: '苹果是一种水果' },
    { id: 2, content: '火车在铁轨上行驶' },
    { id: 3, content: '香蕉也是水果' },
  ];
  for (const [i, c] of chunks.entries()) {
    insertChunk.run({ ...ts, id: i + 1, ordinal: i, content: c.content });
  }
}

describe('向量存储与检索', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
    seedFixture(db);
  });

  it('建表维度记录与一致性检查', () => {
    expect(getVectorDimension(db)).toBeNull();
    ensureVectorTable(db, 3);
    expect(getVectorDimension(db)).toBe(3);
    expect(() => ensureVectorTable(db, 8)).toThrow(/维度冲突/);
  });

  it('归一化：零向量/非法值拒绝', () => {
    expect(() => normalizeVector([0, 0])).toThrow(/零向量/);
    expect(() => normalizeVector([1, Number.NaN])).toThrow(/非有限/);
    const n = normalizeVector([3, 4]);
    expect(Math.hypot(n[0]!, n[1]!)).toBeCloseTo(1);
  });

  it('top-k 检索顺序正确并附带文档元数据', () => {
    ensureVectorTable(db, 3);
    insertChunkVectors(db, [
      { id: 1, vector: [1, 0, 0] },
      { id: 2, vector: [0, 1, 0] },
      { id: 3, vector: [0.9, 0.1, 0] },
    ]);
    const results = searchChunks(db, { knowledgeBaseId: 'kb1', vector: [1, 0, 0], k: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]!.chunkId).toBe(1);
    expect(results[0]!.distance).toBeCloseTo(0);
    expect(results[1]!.chunkId).toBe(3);
    expect(results[0]!.documentName).toBe('a.md');
  });

  it('查询维度不一致抛错；未建表时空结果', () => {
    expect(searchChunks(db, { knowledgeBaseId: 'kb1', vector: [1, 0], k: 2 })).toEqual([]);
    ensureVectorTable(db, 3);
    expect(() =>
      searchChunks(db, { knowledgeBaseId: 'kb1', vector: [1, 0], k: 2 }),
    ).toThrow(/维度/);
  });

  it('删除文档先清向量再级联删除分片', () => {
    ensureVectorTable(db, 3);
    insertChunkVectors(db, [
      { id: 1, vector: [1, 0, 0] },
      { id: 2, vector: [0, 1, 0] },
    ]);
    deleteVectorsByDocument(db, 'd1');
    expect(
      searchChunks(db, { knowledgeBaseId: 'kb1', vector: [1, 0, 0], k: 5 }),
    ).toHaveLength(0);
    db.prepare(`DELETE FROM documents WHERE id = 'd1'`).run();
    const count = db.prepare(`SELECT COUNT(*) AS n FROM document_chunks`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});
