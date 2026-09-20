import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assistantCreateSchema } from '@wbfm/shared';
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
    createSettingsService({ db, cipher }).update({ defaultEmbeddingModelId: model.id });

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

  /** 摄入请求 2 条返回固定向量；查询请求 1 条返回“苹果方向” */
  function mockEmbeddings() {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
      const data =
        body.input.length === 1
          ? [{ index: 0, embedding: [1, 0] }]
          : [
              { index: 0, embedding: [1, 0] },
              { index: 1, embedding: [0, 1] },
            ];
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

  it('RAG 钩子：组装 contextBlock 与 citations；无绑定/空结果返回 null', async () => {
    const kbId = await seedIndex();

    const assistants = createAssistantsService({ db, cipher });
    const assistant = assistants.create(
      assistantCreateSchema.parse({ name: '库助手', systemPrompt: '基于资料回答', knowledgeBaseId: kbId }),
    );
    const rag = await createRagRetriever({ db, cipher })('苹果', assistant);
    expect(rag).not.toBeNull();
    expect(rag!.contextBlock).toContain('[1] 来源：《fruits.txt》');
    expect(rag!.citations[0]).toMatchObject({
      documentName: 'fruits.txt',
      ordinal: 0,
    });
    expect(rag!.citations[0]!.snippet).toContain('苹果');

    const plain = assistants.list().find((a) => a.isBuiltin)!;
    expect(await createRagRetriever({ db, cipher })('任意', plain)).toBeNull();
  });

  it('格式化：长 snippet 截断，context 带编号', () => {
    const chunks = [
      {
        documentId: 'd1',
        documentName: '长文.md',
        ordinal: 3,
        content: 'a'.repeat(300),
        distance: 0.1,
      },
    ];
    expect(toCitations(chunks)[0]!.snippet).toHaveLength(161);
    expect(formatContextBlock(chunks)).toContain('[1] 来源：《长文.md》片段 4');
  });
});
