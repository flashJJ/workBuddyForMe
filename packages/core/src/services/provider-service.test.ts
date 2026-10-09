import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
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

  it('单条密文解密抛错时降级为空密钥，不拖垮整个供应商列表', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const providers = createProviderService({ db, cipher });
    const broken = providers.create({
      name: '坏密文厂商',
      protocol: 'openai-compatible',
      baseUrl: 'https://broken/v1',
      apiKey: 'sk-broken123456',
    });
    const good = providers.create({
      name: '正常厂商',
      protocol: 'openai-compatible',
      baseUrl: 'https://good/v1',
      apiKey: 'sk-good12345678',
    });
    // 契约破坏型 cipher：仅对坏行密文抛错（模拟桥实现违反「失败返回 null」契约）
    const tamperedMarker = 'wbfm.v1.tampered';
    db.prepare('UPDATE providers SET api_key_cipher = ? WHERE id = ?').run(tamperedMarker, broken.id);
    const partialCipher: SecretCipher = {
      encrypt: (plaintext) => cipher.encrypt(plaintext),
      decrypt: (ciphertext) => {
        if (ciphertext === tamperedMarker) throw new Error('cipher boom');
        return cipher.decrypt(ciphertext);
      },
    };
    const tolerant = createProviderService({ db, cipher: partialCipher });

    const list = tolerant.list();
    expect(list).toHaveLength(2);
    const brokenView = list.find((p) => p.id === broken.id)!;
    const goodView = list.find((p) => p.id === good.id)!;
    expect(brokenView.apiKeyMasked).toBeNull();
    expect(goodView.apiKeyMasked).toBe('sk-****5678');
    // 单条 get 同样降级而非 500
    expect(tolerant.get(broken.id).apiKeyMasked).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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
    // v0.5：远端模型发现返回 DiscoveredModel（OpenAI 兼容协议无上下文长度字段，恒为 null）
    await expect(models.fetchRemoteList(provider.id)).resolves.toEqual([
      { id: 'm1', contextLength: null },
      { id: 'm2', contextLength: null },
    ]);

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
