import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settingsUpdateSchema, assistantCreateSchema } from '@wbfm/shared/schemas';
import {
  CONTEXT_MESSAGES_MAX,
  CONTEXT_MESSAGES_MIN,
  DEFAULT_CONTEXT_MESSAGES,
  GLOBAL_APPEND_PROMPT_MAX,
} from '@wbfm/shared/constants';
import type { AppSettings } from '@wbfm/shared/types';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createSettingsService, resolveContextMessageCount, resolveGlobalAppendPrompt } from './settings-service';
import { createAssistantsService } from './assistant-service';
import { resolveChatTargetForModelId } from '../chat/model-resolver';

describe('v1.8 M3 调优设置：上下文条数 + 全局追加', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-tuning-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('默认值：条数 20、追加空串且开关关', () => {
    const settings = createSettingsService({ db, cipher }).get();
    expect(settings.contextMessageCount).toBe(DEFAULT_CONTEXT_MESSAGES);
    expect(settings.globalAppendPrompt).toBe('');
    expect(settings.globalAppendPromptEnabled).toBe(false);
  });

  it('边界 2/50 可存；越界 422；超长追加 422', () => {
    const service = createSettingsService({ db, cipher });
    expect(service.update({ contextMessageCount: CONTEXT_MESSAGES_MIN }).contextMessageCount).toBe(2);
    expect(service.update({ contextMessageCount: CONTEXT_MESSAGES_MAX }).contextMessageCount).toBe(50);
    expect(settingsUpdateSchema.safeParse({ contextMessageCount: 1 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ contextMessageCount: 51 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ contextMessageCount: 20.5 }).success).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({ globalAppendPrompt: 'x'.repeat(GLOBAL_APPEND_PROMPT_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it('服务端钳制：手改 settings_kv 的越界条数读取时回落默认', () => {
    const service = createSettingsService({ db, cipher });
    service.update({ contextMessageCount: 30 });
    // 直接污染底层 KV 模拟手改
    db.prepare(`UPDATE settings_kv SET value = ? WHERE key = 'app-settings'`).run(
      JSON.stringify({ ...service.get(), contextMessageCount: 999 }),
    );
    expect(service.get().contextMessageCount).toBe(DEFAULT_CONTEXT_MESSAGES);
  });

  it('resolveContextMessageCount 纯函数：非法形态回落默认', () => {
    expect(resolveContextMessageCount(2)).toBe(2);
    expect(resolveContextMessageCount(50)).toBe(50);
    expect(resolveContextMessageCount(1)).toBe(DEFAULT_CONTEXT_MESSAGES);
    expect(resolveContextMessageCount(51)).toBe(DEFAULT_CONTEXT_MESSAGES);
    expect(resolveContextMessageCount(2.4)).toBe(DEFAULT_CONTEXT_MESSAGES);
    expect(resolveContextMessageCount(null)).toBe(DEFAULT_CONTEXT_MESSAGES);
    expect(resolveContextMessageCount(undefined)).toBe(DEFAULT_CONTEXT_MESSAGES);
  });

  it('resolveGlobalAppendPrompt：开关关/内容空白均不注入；开关开且非空才生效', () => {
    expect(resolveGlobalAppendPrompt({ globalAppendPromptEnabled: false, globalAppendPrompt: 'x' } as AppSettings))
      .toBeNull();
    expect(resolveGlobalAppendPrompt({ globalAppendPromptEnabled: true, globalAppendPrompt: '   ' } as AppSettings))
      .toBeNull();
    expect(resolveGlobalAppendPrompt({ globalAppendPromptEnabled: undefined, globalAppendPrompt: 'x' } as AppSettings))
      .toBeNull();
    expect(
      resolveGlobalAppendPrompt({ globalAppendPromptEnabled: true, globalAppendPrompt: '  只说中文  ' } as AppSettings),
    ).toBe('只说中文');
  });

  it('场景矩阵：三角色模型 PATCH 落库，协作解析读到变更后的模型', () => {
    // 两个对话模型：默认模型 A，planner 覆盖为 B
    const modelA = seedChatModel();
    const modelB = seedChatModel();
    const service = createSettingsService({ db, cipher });
    service.update({ defaultChatModelId: modelA });

    const assistants = createAssistantsService({ db, cipher });
    const assistant = assistants.create(
      assistantCreateSchema.parse({ name: '矩阵助手' }),
    );
    assistants.update(assistant.id, { plannerModelId: modelB });
    expect(assistants.get(assistant.id).plannerModelId).toBe(modelB);

    // v1.4 协作 planner 通道按覆盖模型解析
    const target = resolveChatTargetForModelId({ db, cipher }, modelB);
    expect(target.model.id).toBe(modelB);

    // null=跟随助手/系统默认
    expect(assistants.update(assistant.id, { plannerModelId: null }).plannerModelId).toBeNull();
  });

  function seedChatModel(): string {
    const provider = createProviderRepository(db).create({
      name: `p-${Math.random().toString(36).slice(2, 8)}`,
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    return createModelRepository(db).create({
      providerId: provider.id,
      modelId: `m-${Math.random().toString(36).slice(2, 8)}`,
      capabilities: ['chat'],
      contextWindow: null,
    }).id;
  }
});
