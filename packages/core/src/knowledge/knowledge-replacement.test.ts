import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService } from '../services/settings-service';
import { createModelRepository } from '@wbfm/database';
import { createProviderRepository } from '@wbfm/database';
import { createIngestionPipeline } from '../ingestion/ingestion-pipeline';
import type { ServiceDeps } from '../services/deps';
import { compileDocument } from './knowledge-compiler';
import { createStaticKnowledgeService } from './static-knowledge-service';

const encoder = new TextEncoder();

describe('T3.5 文档替换：索引重建与编译世代退役', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let deps: ServiceDeps;
  let kbId: string;
  let docId: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t35-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    deps = { db, cipher };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
      const data = body.input.map((_v, i) => ({ index: i, embedding: [1, 0] }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    });

    const provider = createProviderRepository(db).create({
      name: '嵌入', protocol: 'openai-compatible', baseUrl: 'https://x/v1',
      apiKeyCipher: '', enabled: true, sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id, modelId: 'e1', capabilities: ['embedding'], contextWindow: null,
    });
    // 本用例专测替换/退役语义：关掉自动编译，避免队列把 queued 抢跑成 ready
    createSettingsService({ db, cipher }).update({ defaultEmbeddingModelId: model.id, autoCompile: false });

    kbId = createKnowledgeRepository(db).create({ name: '库', chunkSize: 200, chunkOverlap: 10 }).id;
    docId = createDocumentRepository(db).create({
      knowledgeBaseId: kbId, filename: 'model.txt', fileType: '.txt',
      byteSize: 1, contentHash: 'h1',
    }).id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('重摄取后旧编译产物退役（queued/世代0），重编译只命中新内容', async () => {
    const textA = 'Qwen2.5 是一个对话模型。Qwen2.5 兼容 OpenAI 接口。模型支持流式输出。';
    const textB = 'Llama3 是本地可运行的开源模型。Llama3 支持工具调用与多轮推理。';

    await createIngestionPipeline(deps).ingest({ documentId: docId, buffer: encoder.encode(textA) });
    await compileDocument(deps, docId);
    const staticService = createStaticKnowledgeService(deps);
    expect(staticService.retrieve(kbId, 'Qwen2.5 兼容什么？')[0]!.text).toContain('Qwen2.5');

    // 同名替换：用新内容重新摄入同一文档行
    createDocumentRepository(db).replaceContent(docId, { fileType: '.txt', byteSize: 2, contentHash: 'h2' });
    const reingest = await createIngestionPipeline(deps).ingest({
      documentId: docId,
      buffer: encoder.encode(textB),
    });
    expect(reingest.status).toBe('indexed');

    const doc = createDocumentRepository(db).findById(docId)!;
    expect(doc.compileStatus).toBe('queued');
    expect(doc.compileGeneration).toBe(0);
    expect(doc.compiledAt).toBeNull();
    // 旧摘要/mention 已退役
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM document_summaries`).get() as { n: number }).n,
    ).toBe(0);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entity_mentions`).get() as { n: number }).n,
    ).toBe(0);
    // 静态层为空 → 零差异回落（旧实体 Qwen2.5 不再被命中）
    expect(staticService.retrieve(kbId, 'Qwen2.5 兼容什么？')).toEqual([]);
    // 分片也只剩新内容
    const oldHit = db
      .prepare(`SELECT COUNT(*) AS n FROM document_chunks WHERE content LIKE '%Qwen2.5%'`)
      .get() as { n: number };
    expect(oldHit.n).toBe(0);

    // 重新编译：世代从 1 重新起算，实体只剩 Llama3
    const result = await compileDocument(deps, docId);
    expect(result.generation).toBe(1);
    const facts = staticService.retrieve(kbId, 'Llama3 支持什么？');
    expect(facts[0]!.text).toContain('Llama3');
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entities`).get() as { n: number }).n,
    ).toBeGreaterThan(0);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entities WHERE normalized_name LIKE '%qwen%'`).get() as { n: number }).n,
    ).toBe(0);
  });
});
