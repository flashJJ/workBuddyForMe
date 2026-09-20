import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChunkRepository,
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  searchChunks,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService } from '../services/settings-service';
import { createIngestionPipeline } from './ingestion-pipeline';

const encoder = new TextEncoder();

describe('文档摄入管线（TR-16.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let documentId: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t16-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const kb = createKnowledgeRepository(db).create({
      name: '测试库',
      chunkSize: 200,
      chunkOverlap: 20,
    });
    documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'notes.txt',
      fileType: '.txt',
      byteSize: 10,
      contentHash: 'hash-1',
    }).id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  function seedEmbeddingModel() {
    const providers = createProviderRepository(db);
    const provider = providers.create({
      name: '嵌入供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'embed-test',
      capabilities: ['embedding'],
      contextWindow: null,
    });
    createSettingsService({ db, cipher }).update({ defaultEmbeddingModelId: model.id });
  }

  it('未配置 embedding 模型：直接 failed', async () => {
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode('任意内容'),
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('embedding');
    expect(createDocumentRepository(db).findById(documentId)!.status).toBe('failed');
  });

  it('全链路：解析→分片→嵌入→chunks+vec0 落库，可向量检索', async () => {
    seedEmbeddingModel();
    const content = `${'苹果是红色的水果。'.repeat(14)}\n\n${'香蕉是黄色的水果。'.repeat(14)}`;
    const embeddings = Array.from({ length: 2 }, (_, i) =>
      i === 0 ? [1, 0] : [0, 1],
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: embeddings.map((e, i) => ({ index: i, embedding: e })) }), {
          status: 200,
        }),
    );

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });

    expect(result.status).toBe('indexed');
    expect(result.chunkCount).toBe(2);
    const doc = createDocumentRepository(db).findById(documentId)!;
    expect(doc.status).toBe('indexed');
    expect(doc.chunkCount).toBe(2);
    expect(doc.indexedAt).toBeTruthy();
    expect(createChunkRepository(db).countByDocument(documentId)).toBe(2);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('embed-test');
    expect(body.input).toHaveLength(2);

    const kbId = createDocumentRepository(db).findById(documentId)!.knowledgeBaseId;
    const hits = searchChunks(db, { knowledgeBaseId: kbId, vector: [1, 0], k: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content).toContain('苹果');
    expect(hits[0]!.documentName).toBe('notes.txt');
  });

  it('上游嵌入接口 500：文档 failed 且无分片残留', async () => {
    seedEmbeddingModel();
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }));

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode('一些需要嵌入的内容'.repeat(10)),
    });
    expect(result.status).toBe('failed');
    expect(createChunkRepository(db).countByDocument(documentId)).toBe(0);
  });

  it('不支持的文件类型：解析阶段 failed', async () => {
    seedEmbeddingModel();
    createDocumentRepository(db);
    const kb = createKnowledgeRepository(db).list()[0]!;
    const docx = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'word.docx',
      fileType: '.docx',
      byteSize: 1,
      contentHash: 'h2',
    });
    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId: docx.id,
      buffer: encoder.encode('x'),
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('不支持的文件类型');
  });
});
