import { describe, expect, it, beforeEach } from 'vitest';
import {
  createChunkRepository,
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '../index';

describe('knowledge/document/chunk 仓储', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('知识库 CRUD 与 document_count 统计', () => {
    const kbs = createKnowledgeRepository(db);
    const docs = createDocumentRepository(db);
    const kb = kbs.create({ name: '产品文档', chunkSize: 500, chunkOverlap: 80 });
    expect(kbs.findById(kb.id)!.documentCount).toBe(0);

    docs.create({
      knowledgeBaseId: kb.id,
      filename: 'a.md',
      fileType: '.md',
      byteSize: 100,
      contentHash: 'h1',
    });
    expect(kbs.findById(kb.id)!.documentCount).toBe(1);

    const updated = kbs.update(kb.id, { name: '改名', description: 'd' })!;
    expect(updated.name).toBe('改名');
    expect(updated.description).toBe('d');
  });

  it('文档状态流转与 hash 查重', () => {
    const kbs = createKnowledgeRepository(db);
    const docs = createDocumentRepository(db);
    const kb = kbs.create({ name: 'kb', chunkSize: 500, chunkOverlap: 80 });
    const doc = docs.create({
      knowledgeBaseId: kb.id,
      filename: 'b.txt',
      fileType: '.txt',
      byteSize: 20,
      contentHash: 'h2',
    });
    expect(doc.status).toBe('pending');
    expect(docs.findByHash(kb.id, 'h2')!.id).toBe(doc.id);

    docs.setStatus(doc.id, 'failed', { errorMessage: '解析失败' });
    expect(docs.findById(doc.id)!.errorMessage).toBe('解析失败');
    docs.setStatus(doc.id, 'indexed', {
      chunkCount: 3,
      indexedAt: '2026-03-01T00:00:00.000Z',
    });
    const indexed = docs.findById(doc.id)!;
    expect(indexed.status).toBe('indexed');
    expect(indexed.chunkCount).toBe(3);
    expect(docs.listByKnowledgeBase(kb.id)).toHaveLength(1);
  });

  it('分片批量写入返回自增 id 并按序读取', () => {
    const kbs = createKnowledgeRepository(db);
    const docs = createDocumentRepository(db);
    const chunks = createChunkRepository(db);
    const kb = kbs.create({ name: 'kb', chunkSize: 500, chunkOverlap: 80 });
    const doc = docs.create({
      knowledgeBaseId: kb.id,
      filename: 'c.md',
      fileType: '.md',
      byteSize: 1,
      contentHash: 'h3',
    });
    const stored = chunks.bulkInsert(doc.id, [
      { ordinal: 0, content: '第一段', charStart: 0, charEnd: 3 },
      { ordinal: 1, content: '第二段', charStart: 3, charEnd: 6 },
    ]);
    expect(stored.map((c) => c.id).every((id) => Number.isInteger(id))).toBe(true);
    expect(chunks.countByDocument(doc.id)).toBe(2);
    expect(chunks.listByDocument(doc.id).map((c) => c.ordinal)).toEqual([0, 1]);
  });

  it('删除知识库级联文档与分片', () => {
    const kbs = createKnowledgeRepository(db);
    const docs = createDocumentRepository(db);
    const chunks = createChunkRepository(db);
    const kb = kbs.create({ name: 'kb', chunkSize: 500, chunkOverlap: 80 });
    const doc = docs.create({
      knowledgeBaseId: kb.id,
      filename: 'd.md',
      fileType: '.md',
      byteSize: 1,
      contentHash: 'h4',
    });
    chunks.bulkInsert(doc.id, [{ ordinal: 0, content: 'x', charStart: 0, charEnd: 1 }]);
    expect(kbs.delete(kb.id)).toBe(true);
    expect(docs.findById(doc.id)).toBeNull();
    expect(chunks.countByDocument(doc.id)).toBe(0);
  });
});
