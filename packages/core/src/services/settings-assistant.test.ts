import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import { assistantCreateSchema } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createKnowledgeRepository,
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
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
      themeId: 'stellar',
      language: 'zh-CN',
      hasOnboarded: false,
      autoCompile: true,
      compileWithLlm: false,
      compileModelId: null,
      contextMessageCount: 20,
      globalAppendPrompt: '',
      globalAppendPromptEnabled: false,
      // v2.4 M1：演示模式缺省关
      demoModeEnabled: false,
      // v2.4 M1 T7：TTFV 里程碑缺省为空
      firstLaunchAt: null,
      firstModelReadyAt: null,
      firstAnswerAt: null,
      ttfvMs: null,
      // v2.3：动画图覆盖条目与停用列表缺省为空（服务端钳制产出，保证字段恒存在）
      interactionGraphOverrides: [],
      interactionGraphDisabledEntryIds: [],
      // v2.7：桌宠工作汇报缺省（全开、自动气泡、标准节奏）
      workSignalEnabled: true,
      workBubbleMode: 'auto',
      workSoundDone: true,
      workSoundError: true,
      workSoundApproval: true,
      workReduceMotion: false,
      workIdlePacing: 'standard',
      // v2.11：外部代理缺省关闭、未配置命令
      subagentCliEnabled: false,
      subagentCliCommand: '',
      subagentCliArgs: [],
      subagentCliTimeoutMs: 600_000,
      subagentCliMaxOutputBytes: 2_097_152,
    });
    const updated = settings.update({ theme: 'dark' });
    expect(updated.theme).toBe('dark');
    expect(settings.get().defaultChatModelId).toBeNull();
    // v1.8 命名主题持久化
    const themed = settings.update({ themeId: 'sakura' });
    expect(themed.themeId).toBe('sakura');
  });

  it('v2.3：动画图覆盖条目非法时服务端丢弃（合法保留）', () => {
    const settings = createSettingsService({ db, cipher });
    createSettingsRepository(db).setJson('app-settings', {
      interactionGraphOverrides: [
        { key: 'touch::head::tap', chainId: 'head-tap' },
        // 非法触发键（区域不在枚举内）
        { key: 'touch::tail::tap', chainId: 'head-tap' },
        // 未知动作条目 id
        { key: 'touch::body::tap', chainId: 'nope' },
      ],
    });
    expect(settings.get().interactionGraphOverrides).toEqual([
      { key: 'touch::head::tap', chainId: 'head-tap' },
    ]);
  });

  it('v2.3：停用列表的未知 id 被丢弃并去重', () => {
    const settings = createSettingsService({ db, cipher });
    createSettingsRepository(db).setJson('app-settings', {
      interactionGraphDisabledEntryIds: [
        'builtin:head-tap',
        'builtin:head-tap',
        'builtin:nope',
        42,
      ],
    });
    expect(settings.get().interactionGraphDisabledEntryIds).toEqual(['builtin:head-tap']);
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
      assistants.create(assistantCreateSchema.parse({ name: '带知识库', knowledgeBaseIds: [kb.id] }))
        .knowledgeBaseIds,
    ).toEqual([kb.id]);

    // v1.5：关联多个知识库全部落库；引用不存在的库被拒；空库启用 knowledge_search 被拒
    const kb2 = createKnowledgeRepository(db).create({
      name: 'kb2',
      chunkSize: 500,
      chunkOverlap: 80,
    });
    const multi = assistants.create(
      assistantCreateSchema.parse({
        name: '多库助手',
        knowledgeBaseIds: [kb.id, kb2.id],
        enabledTools: ['knowledge_search'],
      }),
    );
    expect(multi.knowledgeBaseIds).toEqual([kb.id, kb2.id]);
    expect(() =>
      assistants.create(
        assistantCreateSchema.parse({ name: '坏库', knowledgeBaseIds: ['no-such-kb'] }),
      ),
    ).toThrow(/知识库不存在/);
    expect(() =>
      assistants.create(
        assistantCreateSchema.parse({ name: '空库工具', enabledTools: ['knowledge_search'] }),
      ),
    ).toThrow(/关联知识库/);

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
