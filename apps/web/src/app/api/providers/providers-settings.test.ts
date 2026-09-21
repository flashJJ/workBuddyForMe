import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listProviders, POST as createProvider } from './route';
import { PATCH, DELETE } from './[id]/route';
import { POST as testConnection } from './[id]/test/route';
import { GET as listModels, POST as addModel } from './[id]/models/route';
import { GET as getSettings, PUT as putSettings } from '../settings/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const providerBody = {
  name: '我的供应',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-secret-1234567890',
};

describe('供应商/模型/设置路由（TR-19.1）', () => {
  let db: DatabaseInstance;
  let providerId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t19-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  async function createValidProvider() {
    const response = await createProvider(jsonRequest(providerBody));
    expect(response.status).toBe(201);
    const payload = (await response.json()).data;
    providerId = payload.id;
    return payload;
  }

  it('供应商创建/列表：Key 永不明文返回', async () => {
    const provider = await createValidProvider();
    expect(provider.apiKeyMasked).toMatch(/^sk-\*+[0-9a-f]{4}$/);
    expect(JSON.stringify(provider)).not.toContain('sk-secret-1234567890');
    expect(provider).not.toHaveProperty('apiKeyCipher');

    const list = await listProviders(new Request('http://x'));
    expect((await list.json()).data).toHaveLength(1);
  });

  it('非法协议 422；更新/不存在 404；删除幂等校验', async () => {
    await createValidProvider();
    const bad = await createProvider(jsonRequest({ ...providerBody, protocol: 'weird' }));
    expect(bad.status).toBe(422);

    const patched = await PATCH(
      jsonRequest({ name: '新名字' }, 'PATCH'),
      { params: Promise.resolve({ id: providerId }) },
    );
    expect((await patched.json()).data.name).toBe('新名字');

    const missing = await PATCH(jsonRequest({ name: 'x' }, 'PATCH'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(missing.status).toBe(404);

    const deleted = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: providerId }),
    });
    expect(deleted.status).toBe(200);
    const again = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: providerId }),
    });
    expect(again.status).toBe(404);
  });

  it('模型：添加/按能力列表/非法能力 422', async () => {
    await createValidProvider();
    const params = { params: Promise.resolve({ id: providerId }) };

    const created = await addModel(
      jsonRequest({ modelId: 'gpt-4o-mini', displayName: '迷你', capabilities: ['chat'] }),
      params,
    );
    expect(created.status).toBe(201);

    const all = await listModels(new Request('http://x'), params);
    expect((await all.json()).data).toHaveLength(1);
    const chatOnly = await listModels(
      new Request('http://x?capability=chat'),
      params,
    );
    expect((await chatOnly.json()).data[0].modelId).toBe('gpt-4o-mini');

    const bad = await addModel(
      jsonRequest({ modelId: 'x', capabilities: ['audio'] }),
      params,
    );
    expect(bad.status).toBe(422);
  });

  it('远端模型列表与连通测试：成功 200，上游 401 归一化 502', async () => {
    await createValidProvider();
    const params = { params: Promise.resolve({ id: providerId }) };
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad key' }), { status: 401 }));

    const remote = await listModels(new Request('http://x?remote=1'), params);
    expect((await remote.json()).data).toEqual(['m1', 'm2']);

    const ok = await testConnection(new Request('http://x', { method: 'POST' }), params);
    expect(ok.status).toBe(200);

    const fail = await testConnection(new Request('http://x', { method: 'POST' }), params);
    expect(fail.status).toBe(502);
    expect((await fail.json()).error.code).toBe('PROVIDER_ERROR');
  });

  it('设置：读取默认值、更新成功、绑定不存在模型 422', async () => {
    const defaults = await getSettings(new Request('http://x'));
    expect((await defaults.json()).data.theme).toBe('light');

    const updated = await putSettings(jsonRequest({ theme: 'dark' }, 'PUT'));
    expect((await updated.json()).data.theme).toBe('dark');

    const bad = await putSettings(
      jsonRequest({ defaultChatModelId: '00000000-0000-0000-0000-000000000000' }, 'PUT'),
    );
    expect(bad.status).toBe(422);
  });
});
