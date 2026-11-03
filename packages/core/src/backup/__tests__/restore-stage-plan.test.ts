import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StagePlan } from '@wbfm/shared/types';
import {
  createAssistantRepository,
  createCharacterCardRepository,
  createConversationRepository,
  createDatabase,
  createModelRepository,
  createProviderRepository,
  createStagePlanRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from '../export';
import { restoreBackup } from '../restore';
import { createWebCipher } from '../../secrets/cipher';
import { ensureSeedData } from '../../services/base/seed';

function plan(title: string, modelId: string | null): StagePlan {
  return {
    steps: [{ title, modelId, skillNames: [], goal: '目标', deliverables: '交付' }],
    activeStep: 0,
  };
}

describe('v2.20 备份阶段计划 roundtrip', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-stage-backup-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('conversations 轨带 stagePlan/modelId；模型缺失时模型回落 null', async () => {
    ensureSeedData(srcDb);
    const provider = createProviderRepository(srcDb).create({
      name: 'P',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(srcDb).create({
      providerId: provider.id,
      modelId: 'chat',
      capabilities: ['chat'],
      contextWindow: null,
    });
    const conversation = createConversationRepository(srcDb).create({
      assistantId: 'builtin-general',
      title: '阶段会话',
    });
    createStagePlanRepository(srcDb).upsert(conversation.id, plan('会话阶段', model.id));
    createConversationRepository(srcDb).setModelId(conversation.id, model.id);

    const { archive } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['conversations'] },
    );
    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.conversations).toBe(1);

    const restoredConv = createConversationRepository(dstDb).findById(conversation.id);
    expect(restoredConv?.title).toBe('阶段会话');
    // 目标库无该模型行 → 恢复端回落 null，不因 FK 阻断
    expect(restoredConv?.modelId).toBeNull();
    expect(createStagePlanRepository(dstDb).get(conversation.id)?.steps[0]?.title).toBe('会话阶段');
  });

  it('events 轨恢复助手默认阶段；内置卡阶段由种子补齐', async () => {
    ensureSeedData(srcDb);
    const assistant = createAssistantRepository(srcDb).create({
      name: '自定义',
      emoji: null,
      color: null,
      systemPrompt: '',
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseIds: [],
      enabledTools: [],
      retrieveAlways: false,
      stagePlan: plan('助手阶段', null),
      isBuiltin: false,
      sortOrder: 1,
    });

    const { archive } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['events'] },
    );
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);

    const restored = createAssistantRepository(dstDb)
      .list()
      .find((item) => item.id === assistant.id);
    expect(restored?.stagePlan?.steps[0]?.title).toBe('助手阶段');

    const builtinCard = createCharacterCardRepository(dstDb).findById('capable-colleague');
    expect(builtinCard?.stagePlan?.steps.map((step) => step.title)).toEqual([
      '明确目标',
      '制定方案',
      '执行交付',
      '复盘验收',
    ]);
  });
});
