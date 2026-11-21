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
import { assistantCreateSchema, type AssistantCreateInput } from '@wbfm/shared/schemas';
import type { Assistant } from '@wbfm/shared/types';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import type { ServiceDeps } from '../base/deps';
import { resolveFallbackChatTargets } from '../../chat/context/model-resolver';
import { createAssistantsService } from './assistant-service';
import { createConversationService } from './conversation-service';

/** v4.19 M1：助手备用模型链与会话级覆盖 */
describe('v4.19 备用模型链与会话覆盖', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let providerId: string;
  let primaryId: string;
  let f1: string;
  let f2: string;
  let f3: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-fallback-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    const provider = createProviderRepository(db).create({
      name: 'fallback-eval',
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    providerId = provider.id;
    const models = createModelRepository(db);
    const addModel = (modelId: string) =>
      models.create({
        providerId,
        modelId,
        displayName: modelId,
        capabilities: ['chat'],
        contextWindow: 8192,
      }).id;
    primaryId = addModel('mock-primary');
    f1 = addModel('mock-f1');
    f2 = addModel('mock-f2');
    f3 = addModel('mock-f3');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const deps = () => ({ db, cipher }) as unknown as ServiceDeps;
  const createAssistant = (input: {
    name: string;
    modelId: string;
    fallbackModelIds?: string[];
  }): Assistant =>
    createAssistantsService({ db, cipher }).create(
      assistantCreateSchema.parse(input) as AssistantCreateInput,
    );

  it('链写入去重、剔除主模型，旧单值键同步为首项', () => {
    const assistants = createAssistantsService({ db, cipher });
    const created = createAssistant({
      name: '链助手',
      modelId: primaryId,
      fallbackModelIds: [f1, f2, f2],
    });
    expect(created.fallbackModelIds).toEqual([f1, f2]);
    expect(created.fallbackModelId).toBe(f1);

    const reloaded = assistants.get(created.id);
    expect(reloaded.fallbackModelIds).toEqual([f1, f2]);
    expect(reloaded.fallbackModelId).toBe(f1);

    assistants.update(created.id, { fallbackModelIds: [f1, primaryId, f2] });
    expect(assistants.get(created.id).fallbackModelIds).toEqual([f1, f2]);
  });

  it('未提供链时保留旧单值语义，并提供数组投影', () => {
    const assistants = createAssistantsService({ db, cipher });
    const created = createAssistant({ name: '单值助手', modelId: primaryId });
    assistants.update(created.id, { fallbackModelId: f2 });
    const reloaded = assistants.get(created.id);
    expect(reloaded.fallbackModelId).toBe(f2);
    expect(reloaded.fallbackModelIds).toEqual([f2]);

    assistants.update(created.id, { fallbackModelIds: [f3, f1] });
    expect(assistants.get(created.id).fallbackModelIds).toEqual([f3, f1]);
    assistants.update(created.id, { fallbackModelIds: [] });
    expect(assistants.get(created.id).fallbackModelIds).toEqual([]);
  });

  it('解析优先级：会话覆盖 > 助手链；清除覆盖回落到链', () => {
    const assistants = createAssistantsService({ db, cipher });
    const created = createAssistant({
      name: '优先级助手',
      modelId: primaryId,
      fallbackModelIds: [f1, f2],
    });
    const conversations = createConversationService({ db, cipher });
    const conversation = conversations.create(created.id, '覆盖测试');
    const primary = createModelRepository(db).findById(primaryId)!;

    const byChain = resolveFallbackChatTargets(
      deps(),
      assistants.get(created.id),
      primary,
      conversation.id,
    );
    expect(byChain.map((item) => item.model.id)).toEqual([f1, f2]);

    conversations.update(conversation.id, { fallbackModelId: f3 });
    const overridden = resolveFallbackChatTargets(
      deps(),
      assistants.get(created.id),
      primary,
      conversation.id,
    );
    expect(overridden.map((item) => item.model.id)).toEqual([f3]);

    conversations.update(conversation.id, { fallbackModelId: null });
    const cleared = resolveFallbackChatTargets(
      deps(),
      assistants.get(created.id),
      primary,
      conversation.id,
    );
    expect(cleared.map((item) => item.model.id)).toEqual([f1, f2]);
  });

  it('无效模型写入被拒绝，读取时跳过已删除模型', () => {
    const assistants = createAssistantsService({ db, cipher });
    const created = createAssistant({
      name: '校验助手',
      modelId: primaryId,
      fallbackModelIds: [f1, f2],
    });
    expect(() => assistants.update(created.id, { fallbackModelIds: ['missing'] })).toThrow(
      '备用模型不存在',
    );

    createModelRepository(db).delete(f1);
    const targets = resolveFallbackChatTargets(
      deps(),
      assistants.get(created.id),
      createModelRepository(db).findById(primaryId)!,
    );
    expect(targets.map((item) => item.model.id)).toEqual([f2]);
  });
});
