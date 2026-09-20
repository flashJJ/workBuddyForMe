import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, assistantCreateSchema } from '@wbfm/shared';
import {
  createDatabase,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { BUILTIN_ASSISTANT, ensureSeedData } from './seed';
import { createSettingsService } from './settings-service';
import { createAssistantsService } from './assistant-service';

describe('settings / assistants 服务（TR-13.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t13-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const seedModel = () => {
    const provider = createProviderRepository(db).create({
      name: 'p',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    return createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'm1',
      capabilities: ['chat'],
      contextWindow: null,
    });
  };

  it('设置默认缺省值；更新合并持久化', () => {
    const settings = createSettingsService({ db, cipher });
    expect(settings.get()).toEqual({
      defaultChatModelId: null,
      defaultEmbeddingModelId: null,
      theme: 'light',
      language: 'zh-CN',
    });
    const updated = settings.update({ theme: 'dark' });
    expect(updated.theme).toBe('dark');
    expect(settings.get().defaultChatModelId).toBeNull();
  });

  it('设置绑定不存在的模型被拒', () => {
    const settings = createSettingsService({ db, cipher });
    expect(() => settings.update({ defaultChatModelId: 'ghost' })).toThrow(ApiError);
    const model = seedModel();
    expect(settings.update({ defaultChatModelId: model.id }).defaultChatModelId).toBe(model.id);
  });

  it('内置助手幂等种子且不可删除', () => {
    ensureSeedData(db);
    ensureSeedData(db);
    const assistants = createAssistantsService({ db, cipher });
    const list = assistants.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(BUILTIN_ASSISTANT.id);
    expect(list[0]!.isBuiltin).toBe(true);
    expect(() => assistants.delete(BUILTIN_ASSISTANT.id)).toThrow(/内置助手不可删除/);
  });

  it('自定义助手 CRUD：绑定校验与排序', () => {
    const assistants = createAssistantsService({ db, cipher });
    expect(() =>
      assistants.create(assistantCreateSchema.parse({ name: 'bad', modelId: 'no-model' })),
    ).toThrow(/模型不存在/);

    const kb = createKnowledgeRepository(db).create({
      name: 'kb',
      chunkSize: 500,
      chunkOverlap: 80,
    });
    expect(
      assistants.create(assistantCreateSchema.parse({ name: '带知识库', knowledgeBaseId: kb.id }))
        .knowledgeBaseId,
    ).toBe(kb.id);

    const a2 = assistants.create(assistantCreateSchema.parse({ name: '第二位' }));
    const a3 = assistants.create(assistantCreateSchema.parse({ name: '第三位' }));
    const ids = assistants.list().map((a) => a.id);
    const reversed = [...ids].reverse();
    assistants.reorder(reversed);
    expect(assistants.list().map((a) => a.id)).toEqual(reversed);

    expect(() => assistants.reorder([a2.id, a3.id])).toThrow(/不一致/);
    expect(assistants.update(a2.id, { name: '改名' })!.name).toBe('改名');
    assistants.delete(a2.id);
    expect(assistants.list().find((a) => a.id === a2.id)).toBeUndefined();
  });
});
