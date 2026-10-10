import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService } from '../services/settings-service';
import { resetCompileQueueServiceForTest } from '../knowledge/compile-queue-service';
import { createIngestionPipeline } from './ingestion-pipeline';

const encoder = new TextEncoder();

/** v1.3 M4：摄入成功尾部的自动编译挂载（开关默认开/关两态） */
describe('摄入管线自动编译挂载（v1.3 M4）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let fetchMock: ReturnType<typeof vi.fn>;
  let documentId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-autoc-')));
    resetCompileQueueServiceForTest();
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
    const provider = createProviderRepository(db).create({
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

  function mockTwoChunkEmbeddings() {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 0, embedding: [1, 0] },
            { index: 1, embedding: [0, 1] },
          ],
        }),
        { status: 200 },
      ),
    );
  }

  it('autoCompile 默认开——索引完成后后台队列自动编译至 ready', async () => {
    seedEmbeddingModel();
    mockTwoChunkEmbeddings();
    const content = `${'苹果是红色的水果。'.repeat(14)}\n\n${'香蕉是黄色的水果。'.repeat(14)}`;

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });
    expect(result.status).toBe('indexed');

    // 摄入置 queued 后队列接管；规则通道同步完成，await 摄入返回时通常已 ready
    await vi.waitFor(() => {
      expect(createDocumentRepository(db).findById(documentId)!.compileStatus).toBe('ready');
    });
  });

  it('autoCompile 关闭——摄入后保持 queued，不自动编译', async () => {
    seedEmbeddingModel();
    createSettingsService({ db, cipher }).update({ autoCompile: false });
    mockTwoChunkEmbeddings();
    const content = `${'苹果是红色的水果。'.repeat(14)}\n\n${'香蕉是黄色的水果。'.repeat(14)}`;

    const result = await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });
    expect(result.status).toBe('indexed');

    // 给后台队列一拍机会也不应起跑
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(createDocumentRepository(db).findById(documentId)!.compileStatus).toBe('queued');
  });
});
