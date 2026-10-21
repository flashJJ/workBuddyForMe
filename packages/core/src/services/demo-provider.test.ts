import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import {
  DEMO_CHAT_MODEL_ID,
  DEMO_EMBED_MODEL_ID,
  DEMO_PROVIDER_ID,
} from '@wbfm/shared/constants';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { buildProvider } from './provider-adapter';
import { disableDemoMode, enableDemoMode } from './demo-provider';
import { createSettingsService } from './settings-service';

describe('v2.4 M1 演示模式：内置 demo 供应商与模型', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-demo-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('开启幂等：固定 id 供应商 + 两个 mock 模型，重复开启不重复建', () => {
    const first = enableDemoMode(db);
    expect(first.providerId).toBe(DEMO_PROVIDER_ID);

    const providers = createProviderRepository(db);
    const models = createModelRepository(db);
    expect(providers.get(DEMO_PROVIDER_ID)?.enabled).toBe(true);
    expect(
      models
        .listByProvider(DEMO_PROVIDER_ID)
        .map((m) => m.modelId)
        .sort(),
    ).toEqual([DEMO_CHAT_MODEL_ID, DEMO_EMBED_MODEL_ID].sort());

    const second = enableDemoMode(db);
    expect(second).toEqual(first);
    expect(models.listByProvider(DEMO_PROVIDER_ID)).toHaveLength(2);
  });

  it('demo 供应商解析为进程内 mock（不解密、不发起真实请求）', async () => {
    enableDemoMode(db);
    const provider = createProviderRepository(db).get(DEMO_PROVIDER_ID)!;
    const adapter = buildProvider(db, cipher, provider);
    expect(adapter.supportsTools).toBe(true);
    expect((await adapter.listModels()).map((m) => m.id).sort()).toEqual(
      [DEMO_CHAT_MODEL_ID, DEMO_EMBED_MODEL_ID].sort(),
    );
  });

  it('设置开关联动：开启回写默认模型；关闭清理供应商/模型并清空默认', () => {
    const service = createSettingsService({ db, cipher });

    const opened = service.update({ demoModeEnabled: true });
    expect(opened.demoModeEnabled).toBe(true);
    expect(opened.defaultChatModelId).toBeTruthy();
    expect(opened.defaultEmbeddingModelId).toBeTruthy();

    const closed = service.update({ demoModeEnabled: false });
    expect(closed.demoModeEnabled).toBe(false);
    expect(closed.defaultChatModelId).toBeNull();
    expect(closed.defaultEmbeddingModelId).toBeNull();
    expect(createProviderRepository(db).get(DEMO_PROVIDER_ID)).toBeNull();
    expect(createModelRepository(db).listByProvider(DEMO_PROVIDER_ID)).toHaveLength(0);
  });

  it('关闭只清空指向 demo 的默认模型，用户自选的正式模型保持不变', () => {
    const service = createSettingsService({ db, cipher });
    const otherModel = seedChatModel();

    service.update({ demoModeEnabled: true });
    service.update({ defaultChatModelId: otherModel });

    const closed = service.update({ demoModeEnabled: false });
    expect(closed.defaultChatModelId).toBe(otherModel);
    expect(closed.defaultEmbeddingModelId).toBeNull();
  });

  it('disableDemoMode 返回被删模型 id（供调用方判断默认模型是否需清空）', () => {
    const artifacts = enableDemoMode(db);
    const removed = disableDemoMode(db);
    expect(removed).toEqual({
      chatModelId: artifacts.chatModelId,
      embedModelId: artifacts.embedModelId,
    });
    // 二次关停幂等：无残留时返回空串
    expect(disableDemoMode(db)).toEqual({ chatModelId: '', embedModelId: '' });
  });

  function seedChatModel(): string {
    const provider = createProviderRepository(db).create({
      name: '自建供应商',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    return createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'real-chat',
      capabilities: ['chat'],
      contextWindow: null,
    }).id;
  }
});
