import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@wbfm/shared';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createModelService } from './model-service';
import { createProviderService } from './provider-service';

describe('provider/model 服务（TR-12.2）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-core-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('CRUD 全程脱敏，数据库只存密文', () => {
    const providers = createProviderService({ db, cipher });
    const created = providers.create({
      name: '厂商',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.x.com/v1',
      apiKey: 'sk-abcd1234efgh',
    });
    expect(created.apiKeyMasked).toBe('sk-****efgh');
    expect(created.enabled).toBe(true);
    expect(created.sortOrder).toBe(0);

    const listed = providers.list()[0]!;
    expect(listed.apiKeyMasked).toBe('sk-****efgh');
    const row = db
      .prepare(`SELECT api_key_cipher FROM providers WHERE id = ?`)
      .get(created.id) as { api_key_cipher: string | null };
    expect(row.api_key_cipher).not.toContain('abcd1234');
    expect(row.api_key_cipher!.startsWith('wbfm.v1.')).toBe(true);

    const updated = providers.update(created.id, {
      name: '新名',
      apiKey: 'sk-zzzz9999aaaa',
    })!;
    expect(updated.name).toBe('新名');
    expect(updated.apiKeyMasked).toBe('sk-****aaaa');

    providers.delete(created.id);
    expect(() => providers.get(created.id)).toThrow(ApiError);
  });

  it('空 Key 允许创建/更新；不存在的 id 返回 NOT_FOUND', () => {
    const providers = createProviderService({ db, cipher });
    const created = providers.create({
      name: '无Key',
      protocol: 'openai-compatible',
      baseUrl: 'https://x',
      apiKey: '',
    });
    expect(created.apiKeyMasked).toBeNull();
    expect(() => providers.update('nope', { name: 'x' })).toThrow(/不存在/);
  });

  it('模型手工维护：新增/重复冲突/删除', () => {
    const providers = createProviderService({ db, cipher });
    const models = createModelService({ db, cipher });
    const provider = providers.create({
      name: 'P',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKey: '',
    });
    const model = models.add(provider.id, {
      modelId: 'gpt-x',
      capabilities: ['chat'],
    });
    expect(model.displayName).toBe('gpt-x');
    expect(models.listByProvider(provider.id)).toHaveLength(1);
    expect(models.listByCapability('chat')[0]!.id).toBe(model.id);
    expect(() =>
      models.add(provider.id, { modelId: 'gpt-x', capabilities: ['chat'] }),
    ).toThrow(/已存在/);
    models.delete(model.id);
    expect(models.listByProvider(provider.id)).toHaveLength(0);
  });

  it('testConnection 成功与失败归一化', async () => {
    const providers = createProviderService({ db, cipher });
    const models = createModelService({ db, cipher });
    const provider = providers.create({
      name: 'P',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKey: 'sk-x',
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'm-a' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(providers.testConnection(provider.id)).resolves.toEqual({ ok: true });
    await expect(models.fetchRemoteList(provider.id)).resolves.toEqual(['m1', 'm2']);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    await expect(providers.testConnection(provider.id)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'PROVIDER_ERROR',
      status: 502,
      details: { upstreamStatus: 401, providerMessage: 'bad key' },
    });
  });
});
