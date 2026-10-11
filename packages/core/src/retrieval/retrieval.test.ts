import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assistantCreateSchema } from '@wbfm/shared/schemas';
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
import { createAssistantsService } from '../services/assistant-service';
import { createIngestionPipeline } from '../ingestion/ingestion-pipeline';
import { createRetrievalService } from './retrieval-service';
import { createRagRetriever } from './rag-retriever';
import { formatContextBlock, toCitations } from './context-formatter';

const encoder = new TextEncoder();

describe('检索与 RAG 编排（TR-17.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t17-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  async function seedIndex() {
    mockEmbeddings();
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
    // 本文件专测检索管线，关闭 v1.3 自动编译避免编译产物影响断言
    createSettingsService({ db, cipher }).update({
      defaultEmbeddingModelId: model.id,
      autoCompile: false,
    });

    const kb = createKnowledgeRepository(db).create({
      name: '资料库',
      chunkSize: 200,
      chunkOverlap: 20,
    });
    const documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'fruits.txt',
      fileType: '.txt',
      byteSize: 1,
      contentHash: 'h1',
    }).id;
    const content = `${'苹果是红色的水果。'.repeat(14)}\n\n${'香蕉是黄色的水果。'.repeat(14)}`;
    await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });
    return kb.id;
  }

  /** 第二个库：制度文档（与 seedIndex 同 embedding mock，各产出约 2 个分片） */
  async function seedSecondKb() {
    const kb = createKnowledgeRepository(db).create({
      name: '制度库',
      chunkSize: 200,
      chunkOverlap: 20,
    });
    const documentId = createDocumentRepository(db).create({
      knowledgeBaseId: kb.id,
      filename: 'vacation.txt',
      fileType: '.txt',
      byteSize: 1,
      contentHash: 'h2',
    }).id;
    const content = '年假制度规定入职满一年可休年假五天。'.repeat(20);
    await createIngestionPipeline({ db, cipher }).ingest({
      documentId,
      buffer: encoder.encode(content),
    });
    return kb.id;
  }

  /** 摄入请求按分片数返回固定向量（偶数索引「苹果方向」，奇数正交方向）；查询为苹果方向 */
  function mockEmbeddings() {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
      const data =
        body.input.length === 1
          ? [{ index: 0, embedding: [1, 0] }]
          : body.input.map((_text, i) => ({
              index: i,
              embedding: i % 2 === 0 ? [1, 0] : [0, 1],
            }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
  }

  it('query embedding → top-k 按距离排序，空查询/未配置模型安全退化', async () => {
    const kbId = await seedIndex();

    const hits = await createRetrievalService({ db, cipher }).retrieve({
      knowledgeBaseId: kbId,
      query: '苹果是什么颜色',
      topK: 2,
    });
    expect(hits).toHaveLength(2);
    expect(hits[0]!.content).toContain('苹果');
    expect(hits[0]!.distance).toBeLessThan(hits[1]!.distance);
    expect(hits[0]!.documentName).toBe('fruits.txt');

    expect(
      await createRetrievalService({ db, cipher }).retrieve({
        knowledgeBaseId: kbId,
        query: '   ',
      }),
    ).toEqual([]);
  });

  it('retrieveMany：跨多库一次融合召回，空库数组零成本返回 []', async () => {
    const kb1 = await seedIndex();
    const kb2 = await seedSecondKb();

    const retrieval = createRetrievalService({ db, cipher });
    expect(await retrieval.retrieveMany({ knowledgeBaseIds: [], query: '年假' })).toEqual([]);

    // 两库各约 2 个分片，默认上限 8：融合结果同时覆盖两个库的文档
    const hits = await retrieval.retrieveMany(
      { knowledgeBaseIds: [kb1, kb2], query: '年假 苹果' },
      { maxChunks: 8 },
    );
    expect(hits.length).toBeGreaterThan(0);
    const docs = new Set(hits.map((h) => h.documentName));
    expect(docs.has('fruits.txt')).toBe(true);
    expect(docs.has('vacation.txt')).toBe(true);

    // 单库过滤：只查 kb2 时不返回 kb1 文档
    const onlyKb2 = await retrieval.retrieveMany({ knowledgeBaseIds: [kb2], query: '年假' });
    expect(onlyKb2.every((h) => h.documentName === 'vacation.txt')).toBe(true);
  });

  it('RAG 钩子：多库助手的引用跨库汇聚；无绑定返回 null', async () => {
    const kb1 = await seedIndex();
    const kb2 = await seedSecondKb();

    const assistants = createAssistantsService({ db, cipher });
    const assistant = assistants.create(
      assistantCreateSchema.parse({
        name: '双库助手',
        systemPrompt: '基于资料回答',
        knowledgeBaseIds: [kb1, kb2],
      }),
    );
    const rag = await createRagRetriever({ db, cipher })('年假 苹果', assistant);
    expect(rag).not.toBeNull();
    const citedDocs = new Set(rag!.citations.map((c) => c.documentName));
    expect(citedDocs.has('fruits.txt')).toBe(true);
    expect(citedDocs.has('vacation.txt')).toBe(true);

    const plain = assistants.list().find((a) => a.isBuiltin)!;
    expect(await createRagRetriever({ db, cipher })('任意', plain)).toBeNull();
  });

  it('RAG 钩子（单库）：组装 contextBlock 与 citations', async () => {
    const kbId = await seedIndex();
    const assistants = createAssistantsService({ db, cipher });
    const assistant = assistants.create(
      assistantCreateSchema.parse({ name: '库助手', systemPrompt: '基于资料回答', knowledgeBaseIds: [kbId] }),
    );
    const rag = await createRagRetriever({ db, cipher })('苹果', assistant);
    expect(rag).not.toBeNull();
    expect(rag!.contextBlock).toContain('[1] 来源：《fruits.txt》');
    expect(rag!.citations[0]).toMatchObject({
      documentName: 'fruits.txt',
      ordinal: 0,
    });
    expect(rag!.citations[0]!.snippet).toContain('苹果');
  });

  it('格式化：长 snippet 截断，context 带编号', () => {
    const chunks = [
      {
        documentId: 'd1',
        documentName: '长文.md',
        ordinal: 3,
        content: 'a'.repeat(300),
        distance: 0.1,
        sourceUrl: null,
      },
    ];
    expect(toCitations(chunks)[0]!.snippet).toHaveLength(161);
    expect(formatContextBlock(chunks)).toContain('[1] 来源：《长文.md》片段 4');
  });
});
