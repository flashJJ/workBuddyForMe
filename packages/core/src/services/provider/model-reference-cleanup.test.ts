import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createModelService } from './model-service';
import { createProviderService } from './provider-service';
import { createSettingsService } from '../settings/settings-service';

/**
 * 删除模型/供应商后的悬空默认绑定清理。
 * assistants/conversations 的 model_id 有外键 SET NULL，
 * 但设置是 JSON（无外键），不清理会让新对话报「对话模型不存在」。
 */
describe('删除模型后的设置引用清理', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-model-ref-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function seedModel() {
    const providers = createProviderService({ db, cipher });
    const models = createModelService({ db, cipher });
    const settings = createSettingsService({ db, cipher });
    const provider = providers.create({
      name: '厂商',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.x.com/v1',
      apiKey: 'sk-test',
    });
    const model = models.add(provider.id, {
      modelId: 'gpt-x',
      displayName: 'GPT-X',
      capabilities: ['chat'],
      contextWindow: 8192,
    });
    settings.update({ defaultChatModelId: model.id });
    expect(settings.get().defaultChatModelId).toBe(model.id);
    return { providers, models, settings, provider, model };
  }

  it('删除模型后清空默认模型设置', () => {
    const { models, settings, model } = seedModel();
    models.delete(model.id);
    expect(settings.get().defaultChatModelId).toBeNull();
  });

  it('删除供应商后清空其模型的默认绑定', () => {
    const { providers, settings, provider } = seedModel();
    providers.delete(provider.id);
    expect(settings.get().defaultChatModelId).toBeNull();
  });
});
