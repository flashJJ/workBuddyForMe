import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChunkRepository,
  createDatabase,
  createDocumentRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService, createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listKb, POST as createKb } from './route';
import { GET as getKb, PATCH, DELETE } from './[id]/route';
import { GET as listDocs, POST as uploadDoc } from './[id]/documents/route';
import { GET as getDoc, DELETE as deleteDoc } from '../documents/[id]/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadForm(id: string, filename: string, content: string) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  return uploadDoc(new Request(`http://x/api/knowledge-bases/${id}/documents`, {
    method: 'POST',
    body: form,
  }), { params: Promise.resolve({ id }) });
}

describe('知识库与文档路由（TR-22.1）', () => {
  let db: DatabaseInstance;
  let kbId: string;

  beforeEach(async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t22-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());

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
    createSettingsService({ db, cipher: createWebCipher() }).update({
      defaultEmbeddingModelId: model.id,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] };
        const data = body.input.map((_text, index) => ({ index, embedding: [1, 0] }));
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    );

    const response = await createKb(jsonRequest({ name: '产品手册库' }));
    kbId = (await response.json()).data.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  async function pollDocument(id: string) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await getDoc(new Request('http://x'), {
        params: Promise.resolve({ id }),
      });
      const doc = (await response.json()).data;
      if (doc.status === 'indexed' || doc.status === 'failed') return doc;
      await sleep(20);
    }
    throw new Error('文档状态轮询超时');
  }

  it('知识库 CRUD：默认分片参数、读取/更新/404', async () => {
    expect((await (await listKb(new Request('http://x'))).json()).data).toHaveLength(1);
    const detail = await getKb(new Request('http://x'), { params: Promise.resolve({ id: kbId }) });
    expect((await detail.json()).data.chunkSize).toBeGreaterThan(0);

    const patched = await PATCH(jsonRequest({ description: '产品文档' }, 'PATCH'), {
      params: Promise.resolve({ id: kbId }),
    });
    expect((await patched.json()).data.description).toBe('产品文档');
  });

  it('上传 txt：轮询至 indexed，分片计数 > 0；重复上传 409；docx 422', async () => {
    const content = `苹果是一种水果。`.repeat(120);
    const uploaded = await uploadForm(kbId, 'notes.txt', content);
    expect(uploaded.status).toBe(201);
    const document = (await uploaded.json()).data;
    expect(document.status).toBe('pending');

    const indexed = await pollDocument(document.id);
    expect(indexed.status).toBe('indexed');
    expect(indexed.chunkCount).toBeGreaterThan(0);
    expect(createChunkRepository(db).countByDocument(document.id)).toBeGreaterThan(0);

    const docs = await listDocs(new Request('http://x'), { params: Promise.resolve({ id: kbId }) });
    expect((await docs.json()).data).toHaveLength(1);

    const duplicate = await uploadForm(kbId, 'copy.txt', content);
    expect(duplicate.status).toBe(409);

    const unsupported = await uploadForm(kbId, 'word.docx', 'x');
    expect(unsupported.status).toBe(422);
  });

  it('删除文档 404；删除知识库后文档/分片计数归零', async () => {
    const content = `香蕉是黄色的。`.repeat(120);
    const uploaded = await uploadForm(kbId, 'b.txt', content);
    const document = (await uploaded.json()).data;
    await pollDocument(document.id);

    const removed = await deleteDoc(new Request('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: document.id }),
    });
    expect(removed.status).toBe(200);
    const missing = await getDoc(new Request('http://x'), {
      params: Promise.resolve({ id: document.id }),
    });
    expect(missing.status).toBe(404);
    expect(createChunkRepository(db).countByDocument(document.id)).toBe(0);

    const second = await uploadForm(kbId, 'c.txt', content);
    await pollDocument((await second.json()).data.id);
    expect(createDocumentRepository(db).listByKnowledgeBase(kbId).length).toBe(1);

    const deletedKb = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: kbId }),
    });
    expect(deletedKb.status).toBe(200);
    expect(createDocumentRepository(db).listByKnowledgeBase(kbId)).toHaveLength(0);
  });
});
