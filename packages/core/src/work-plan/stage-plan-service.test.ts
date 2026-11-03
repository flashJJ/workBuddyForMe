import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StagePlan } from '@wbfm/shared/types';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
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
import type { ServiceDeps } from '../services/base/deps';
import { createWebCipher } from '../secrets/cipher';
import { createConversationService } from '../services/assistant/conversation-service';
import { createCharacterCardService } from '../services/assistant/character-card-service';
import { resolveChatTarget } from '../chat/context/model-resolver';
import { createStagePlanService } from './stage-plan-service';

const TS = '2026-11-03T00:00:00.000Z';

function step(title: string, extra: Partial<StagePlan['steps'][number]> = {}) {
  return { title, modelId: null, skillNames: [], goal: '', deliverables: '', ...extra };
}

function plan(overrides: Partial<StagePlan> = {}): StagePlan {
  return { steps: [step('明确目标', { goal: '整理需求' })], activeStep: null, ...overrides };
}

function skillStub(available = true): ServiceDeps['skills'] {
  return {
    list: () => [
      {
        name: 'research',
        enabled: available,
        exists: available,
        sourcePath: '/skills/research',
        manifest: available ? { name: 'research', description: '' } : null,
      },
    ],
  } as unknown as ServiceDeps['skills'];
}

const PARSED_CARD: ParsedCharacterCard = {
  name: 'C',
  description: '',
  defaultEmotion: 'neutral',
  voice: null,
  identity: '',
  traits: [],
  speakingStyle: [],
  boundaries: [],
};

describe('v2.20 M4 阶段计划服务', () => {
  let db: DatabaseInstance;
  let deps: ServiceDeps;
  let modelChat: string;
  let modelEmbedding: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-stage-plan-')));
    db = createDatabase(':memory:');
    deps = { db, cipher: createWebCipher(), skills: skillStub() };
    db.prepare(`INSERT INTO assistants(id,name,created_at,updated_at) VALUES ('a1','A',?,?)`).run(TS, TS);
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at) VALUES ('c1','a1','T',?,?)`,
    ).run(TS, TS);
    const provider = createProviderRepository(db).create({
      name: 'P',
      protocol: 'openai-compatible',
      baseUrl: 'https://x/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    modelChat = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'chat',
      capabilities: ['chat'],
      contextWindow: null,
    }).id;
    modelEmbedding = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'embedding',
      capabilities: ['embedding'],
      contextWindow: null,
    }).id;
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('保存/读取完整计划，并按 activeStep 同步会话模型', () => {
    const service = createStagePlanService(deps);
    const first = service.save('c1', {
      steps: [step('阶段一', { modelId: modelChat }), step('阶段二')],
      activeStep: 0,
    });
    expect(first.modelId).toBe(modelChat);
    expect(createConversationRepository(db).findById('c1')?.modelId).toBe(modelChat);
    expect(service.get('c1')?.steps).toHaveLength(2);

    const cleared = service.save('c1', {
      steps: [step('阶段一'), step('阶段二')],
      activeStep: null,
    });
    expect(cleared.modelId).toBeNull();
    expect(createConversationRepository(db).findById('c1')?.modelId).toBeNull();
  });

  it('非法计划/模型/技能返回 422，不落库', () => {
    const service = createStagePlanService(deps);
    expect(() =>
      service.save('c1', { steps: Array.from({ length: 9 }, (_, i) => step(`阶段${i}`)), activeStep: null }),
    ).toThrow(/阶段计划不合法/);
    expect(() => service.save('c1', plan({ steps: [step('A', { modelId: modelEmbedding })] }))).toThrow(
      /不支持对话/,
    );
    expect(() => service.save('c1', plan({ steps: [step('A', { skillNames: ['missing'] })] }))).toThrow(
      /不可用技能/,
    );
    expect(createStagePlanRepository(db).get('c1')).toBeNull();
  });

  it('prepare 组装任务文本并校验目标/序号', () => {
    const service = createStagePlanService(deps);
    service.save('c1', {
      steps: [
        step('调研', {
          goal: '整理竞品',
          deliverables: '对比表',
          skillNames: ['research'],
          modelId: modelChat,
        }),
      ],
      activeStep: 0,
    });
    const result = service.prepare('c1', 0);
    expect(result.modelId).toBe(modelChat);
    expect(result.taskText).toContain('执行阶段：调研');
    expect(result.taskText).toContain('要解决的问题：\n整理竞品');
    expect(result.taskText).toContain('- research：/skills/research');
    expect(result.taskText).toContain('交付要求：\n对比表');
    expect(result.taskText).toContain('沿用当前会话上下文');

    expect(() => service.prepare('c1', 1)).toThrow(/超出范围/);
    service.save('c1', { steps: [step('空目标')], activeStep: null });
    expect(() => service.prepare('c1', 0)).toThrow(/缺少目标/);
  });

  it('创建会话时按助手阶段或角色卡默认阶段复制', () => {
    const assistants = createAssistantRepository(db);
    const cards = createCharacterCardRepository(db);
    const card = cards.create({
      source: 'builtin',
      rawMarkdown: '# C',
      parsed: PARSED_CARD,
      stagePlan: plan({ steps: [step('卡阶段', { modelId: modelChat })], activeStep: 0 }),
    });
    assistants.update('a1', { cardId: card.id });
    const conversations = createConversationService(deps);
    const conversation = conversations.create('a1');
    const copied = createStagePlanRepository(db).get(conversation.id);
    expect(copied?.steps[0]?.title).toBe('卡阶段');
    expect(conversation.modelId).toBe(modelChat);

    const explicit = plan({ steps: [step('助手阶段')] });
    assistants.update('a1', { stagePlan: explicit });
    const second = conversations.create('a1');
    expect(createStagePlanRepository(db).get(second.id)?.steps[0]?.title).toBe('助手阶段');
  });

  it('对话模型解析：会话覆盖 > 助手绑定 > 系统默认', () => {
    const providerId = createModelRepository(db).findById(modelChat)!.providerId;
    const secondChat = createModelRepository(db).create({
      providerId,
      modelId: 'chat-2',
      capabilities: ['chat'],
      contextWindow: null,
    }).id;
    const assistant = createAssistantRepository(db).findById('a1')!;
    expect(resolveChatTarget(deps, assistant, modelChat).model.id).toBe(modelChat);
    createAssistantRepository(db).update('a1', { modelId: secondChat });
    const updated = createAssistantRepository(db).findById('a1')!;
    // 会话覆盖优先于助手绑定
    expect(resolveChatTarget(deps, updated, modelChat).model.id).toBe(modelChat);
    expect(resolveChatTarget(deps, updated, null).model.id).toBe(secondChat);
  });

  it('应用角色卡只在助手阶段为空时复制', () => {
    const cards = createCharacterCardRepository(db);
    const cardA = cards.create({
      source: 'builtin',
      rawMarkdown: '# A',
      parsed: PARSED_CARD,
      stagePlan: plan({ steps: [step('A')] }),
    });
    const cardB = cards.create({
      source: 'builtin',
      rawMarkdown: '# B',
      parsed: PARSED_CARD,
      stagePlan: plan({ steps: [step('B')] }),
    });
    const assistants = createAssistantRepository(db);
    const service = createCharacterCardService(deps);

    const assigned = service.assignCard('a1', cardA.id);
    expect(assigned.stagePlan?.steps[0]?.title).toBe('A');
    const again = service.assignCard('a1', cardB.id);
    expect(again.stagePlan?.steps[0]?.title).toBe('A');
    expect(again.cardId).toBe(cardB.id);
    expect(assistants.findById('a1')?.stagePlan?.steps[0]?.title).toBe('A');
  });
});
