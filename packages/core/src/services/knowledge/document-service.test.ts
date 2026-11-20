import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createFtsChunkRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createKnowledgeRepository } from '@wbfm/database';
import { createDocumentService } from './document-service';
import { ApiError } from '@wbfm/shared/errors';

const encoder = new TextEncoder();

describe('document-service 上传去重与同名替换（v1.3 T3.5）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let kbId: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-docsvc-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    kbId = createKnowledgeRepository(db).create({ name: '库', chunkSize: 200, chunkOverlap: 10 }).id;
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('同名不同内容：复用文档行（id 不变）并复位元数据，不新增文档', () => {
    const service = createDocumentService({ db, cipher });
    const first = service.upload(kbId, { filename: 'spec.txt', buffer: encoder.encode('旧内容正文') });
    expect(first.status).toBe('pending');

    const replaced = service.upload(kbId, { filename: 'spec.txt', buffer: encoder.encode('全新的正文内容') });
    expect(replaced.id).toBe(first.id);
    expect(replaced.contentHash).not.toBe(first.contentHash);
    expect(replaced.status).toBe('pending');
    expect(service.listByKnowledgeBase(kbId)).toHaveLength(1);
  });

  it('同内容 hash 仍 409 拦截（同名且内容没变）', () => {
    const service = createDocumentService({ db, cipher });
    const buffer = encoder.encode('完全相同的正文');
    service.upload(kbId, { filename: 'spec.txt', buffer });
    expect(() => service.upload(kbId, { filename: 'spec.txt', buffer })).toThrow(ApiError);
  });

  it('不同名新文档正常新增', () => {
    const service = createDocumentService({ db, cipher });
    const a = service.upload(kbId, { filename: 'a.txt', buffer: encoder.encode('正文一') });
    const b = service.upload(kbId, { filename: 'b.txt', buffer: encoder.encode('正文二') });
    expect(a.id).not.toBe(b.id);
    expect(service.listByKnowledgeBase(kbId)).toHaveLength(2);
  });

  it('删除文档时同步清掉 chunks_fts（FTS 不随外键级联）', () => {
    const service = createDocumentService({ db, cipher });
    const doc = service.upload(kbId, {
      filename: 'fts.txt',
      buffer: encoder.encode('待删除正文'),
    });
    db.prepare(
      `INSERT INTO document_chunks(id,document_id,ordinal,content,created_at)
       VALUES (9001, ?, 0, '待删除正文', 't')`,
    ).run(doc.id);
    const fts = createFtsChunkRepository(db);
    fts.bulkInsert([{ chunkId: 9001, knowledgeBaseId: kbId, content: '待删除正文' }]);
    expect(fts.matchChunkIds(kbId, '删除正文', 10)).toEqual([9001]);

    service.delete(doc.id);

    expect(fts.matchChunkIds(kbId, '删除正文', 10)).toEqual([]);
    const chunkCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM document_chunks WHERE document_id = ?`).get(doc.id) as {
        n: number;
      }
    ).n;
    expect(chunkCount).toBe(0);
  });
});
