import { describe, expect, it, beforeEach } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
  type DatabaseInstance,
} from '../index';

describe('provider/model/assistant/settings 仓储', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('provider CRUD 与密文隔离', () => {
    const repo = createProviderRepository(db);
    const p = repo.create({
      name: '厂商A',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.a.com/v1',
      apiKeyCipher: 'enc:xxx',
      enabled: true,
      sortOrder: 1,
    });
    expect(p.hasApiKey).toBe(true);
    expect(p).not.toHaveProperty('api_key_cipher');
    expect(repo.getRow(p.id)!.api_key_cipher).toBe('enc:xxx');

    const updated = repo.update(p.id, { enabled: false, name: '厂商A2' })!;
    expect(updated.enabled).toBe(false);
    expect(updated.name).toBe('厂商A2');
    expect(updated.updatedAt).toBeTruthy();
    expect(repo.count()).toBe(1);
    expect(repo.delete(p.id)).toBe(true);
    expect(repo.get(p.id)).toBeNull();
  });

  it('model 按供应商与能力过滤，供应商删除级联', () => {
    const providers = createProviderRepository(db);
    const models = createModelRepository(db);
    const p = providers.create({
      name: 'P',
      protocol: 'openai-compatible',
      baseUrl: 'https://x',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    const m = models.create({
      providerId: p.id,
      modelId: 'gpt-x',
      capabilities: ['chat', 'embedding'],
      contextWindow: 8192,
    });
    expect(models.findById(m.id)!.capabilities).toEqual(['chat', 'embedding']);
    expect(models.listByProvider(p.id)).toHaveLength(1);
    expect(models.listByCapability('embedding')[0]!.id).toBe(m.id);
    expect(models.exists(p.id, 'gpt-x')).toBe(true);
    providers.delete(p.id);
    expect(models.findById(m.id)).toBeNull();
  });

  it('assistant CRUD：内置助手不可删、可更新', () => {
    const repo = createAssistantRepository(db);
    const builtin = repo.create({
      name: '通用助手',
      emoji: '🤖',
      color: '#000000',
      systemPrompt: '',
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseId: null,
      enabledTools: [],
      retrieveAlways: false,
      isBuiltin: true,
      sortOrder: 0,
    });
    const custom = repo.create({
      name: '我的',
      emoji: null,
      color: null,
      systemPrompt: 's',
      temperature: 0.5,
      topP: 0.8,
      maxTokens: 100,
      modelId: null,
      knowledgeBaseId: null,
      enabledTools: [],
      retrieveAlways: false,
      isBuiltin: false,
      sortOrder: 1,
    });
    expect(repo.list().map((a) => a.id)).toEqual([builtin.id, custom.id]);
    expect(repo.delete(builtin.id)).toBe(false);
    const updated = repo.update(custom.id, { name: '改名', temperature: 0.2 })!;
    expect(updated.name).toBe('改名');
    expect(updated.temperature).toBe(0.2);
    expect(repo.delete(custom.id)).toBe(true);
  });

  it('settings KV 读写 JSON 与损坏兜底', () => {
    const repo = createSettingsRepository(db);
    expect(repo.getJson('theme', 'light')).toBe('light');
    repo.setJson('cfg', { a: 1 });
    expect(repo.getJson('cfg', null)).toEqual({ a: 1 });
    db.prepare(`INSERT INTO settings_kv(key, value, updated_at) VALUES('bad','{x','t')`).run();
    expect(repo.getJson('bad', 'fallback')).toBe('fallback');
    expect(repo.all()['cfg']).toEqual({ a: 1 });
  });
});
