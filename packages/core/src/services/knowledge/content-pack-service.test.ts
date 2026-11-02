import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, createDocumentRepository, createKnowledgeRepository } from '@wbfm/database';
import type { ServiceDeps } from '../base/deps';
import { createContentPackService } from './content-pack-service';
import type { ContentPackDefinition } from './content-pack-types';

const KB_ID = 'c0000000-0000-4000-8000-000000000099';
const A = new TextEncoder().encode('# 第 1 节\n内容 A');
const B = new TextEncoder().encode('# 第 2 节\n内容 B');

const hashOf = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const PACK_SHA = hashOf(Buffer.concat([Buffer.from(A), Buffer.from(B)]));

const PACK: ContentPackDefinition = {
  id: 'test-pack',
  name: '测试内容包',
  description: '用于单测的内容包',
  sourceUrl: 'https://example.com/pack',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  version: 'abc1234',
  publishedAt: '2026-10-21',
  sha256: PACK_SHA,
  totalBytes: A.byteLength + B.byteLength,
  targetKnowledgeBaseId: KB_ID,
  chunkSize: 600,
  chunkOverlap: 80,
  disclaimer: '仅用于单测。',
  files: [
    {
      filename: '01-a.md',
      url: 'https://example.com/a.md',
      sha256: hashOf(A),
      byteSize: A.byteLength,
    },
    {
      filename: '02-b.md',
      url: 'https://example.com/b.md',
      sha256: hashOf(B),
      byteSize: B.byteLength,
    },
  ],
};

function makeService(options: {
  fetchFile?: (url: string) => Promise<Uint8Array>;
  embeddingReady?: boolean;
  pack?: ContentPackDefinition;
} = {}) {
  const db = createDatabase(':memory:');
  const deps = { db } as unknown as ServiceDeps;
  const files = new Map([
    ['https://example.com/a.md', A],
    ['https://example.com/b.md', B],
  ]);
  const fetchFile =
    options.fetchFile ??
    (vi.fn(async (url: string) => {
      const bytes = files.get(url);
      if (!bytes) throw new Error('not found');
      return bytes;
    }) as (url: string) => Promise<Uint8Array>);
  const service = createContentPackService(deps, {
    packs: [options.pack ?? PACK],
    fetchFile,
    embeddingReady: () => options.embeddingReady ?? true,
    autoIngest: false,
  });
  return { db, service, fetchFile };
}

describe('内容包服务（v2.18 M4）', () => {
  it('list 返回清单元数据；未导入时 imported=false', () => {
    const { db, service } = makeService();
    expect(service.list()).toEqual([
      expect.objectContaining({
        id: 'test-pack',
        fileCount: 2,
        totalBytes: A.byteLength + B.byteLength,
        sha256: PACK_SHA,
        imported: false,
        documentCount: 0,
      }),
    ]);
    db.close();
  });

  it('importPack：逐文件与整包校验通过后建库，署名页 + 2 个原文入库', async () => {
    const { db, service } = makeService();
    const result = await service.importPack('test-pack');

    expect(result.knowledgeBase.id).toBe(KB_ID);
    expect(result.importedDocuments).toBe(3);
    expect(result.sha256).toBe(PACK_SHA);
    expect(service.list()[0]).toMatchObject({ imported: true, documentCount: 3 });

    const docs = createDocumentRepository(db).listByKnowledgeBase(KB_ID);
    expect(docs.map((doc) => doc.filename).sort()).toEqual([
      '00-内容包署名与免责声明.md',
      '01-a.md',
      '02-b.md',
    ]);
    db.close();
  });

  it('单文件哈希不一致：拒绝导入且不建库', async () => {
    const { db, service } = makeService({
      fetchFile: async (url) =>
        url.endsWith('b.md') ? new TextEncoder().encode('# 被篡改') : A,
    });
    await expect(service.importPack('test-pack')).rejects.toMatchObject({
      code: 'CONTENT_PACK_HASH_MISMATCH',
    });
    expect(createKnowledgeRepository(db).findById(KB_ID)).toBeNull();
    expect(service.list()[0]?.imported).toBe(false);
    db.close();
  });

  it('整包哈希不一致：拒绝导入且不建库', async () => {
    const { db, service } = makeService({
      pack: { ...PACK, sha256: 'f'.repeat(64) },
    });
    await expect(service.importPack('test-pack')).rejects.toMatchObject({
      code: 'CONTENT_PACK_HASH_MISMATCH',
    });
    expect(createKnowledgeRepository(db).findById(KB_ID)).toBeNull();
    db.close();
  });

  it('重复导入冲突；未配置 embedding 时下载前即拒绝', async () => {
    const { db, service, fetchFile } = makeService();
    await service.importPack('test-pack');
    await expect(service.importPack('test-pack')).rejects.toMatchObject({ code: 'CONFLICT' });
    db.close();

    const missing = makeService({ embeddingReady: false });
    await expect(missing.service.importPack('test-pack')).rejects.toMatchObject({
      code: 'EMBEDDING_NOT_CONFIGURED',
    });
    expect(missing.fetchFile).not.toHaveBeenCalled();
    expect(createKnowledgeRepository(missing.db).findById(KB_ID)).toBeNull();
    missing.db.close();
    expect(fetchFile).toHaveBeenCalled();
  });

  it('下载失败：抛出可读错误且不建库', async () => {
    const { db, service } = makeService({
      fetchFile: async () => {
        throw new Error('network down');
      },
    });
    await expect(service.importPack('test-pack')).rejects.toMatchObject({
      code: 'CONTENT_PACK_FETCH_FAILED',
    });
    expect(createKnowledgeRepository(db).findById(KB_ID)).toBeNull();
    db.close();
  });

  it('未知 id 返回 404', async () => {
    const { db, service } = makeService();
    await expect(service.importPack('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    db.close();
  });
});
