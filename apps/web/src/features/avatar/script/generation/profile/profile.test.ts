import { describe, expect, it } from 'vitest';
import type { ResolvedChatTarget } from '@wbfm/core/chat';
import type { Memory } from '@wbfm/shared/types';
import {
  profileContextForPrompt,
  selectProfileMemories,
  PROFILE_MAX_MEMORIES,
} from './index';
import { createPetScriptGenerator } from '../service';
import type { PetScriptGenerationState } from '../state';

function memory(
  id: string,
  kind: Memory['kind'],
  content: string,
  overrides: Partial<Memory> = {},
): Memory {
  return {
    id,
    kind,
    content,
    importance: 0.5,
    sourceConversationId: null,
    sourceMessageId: null,
    recallCount: 0,
    status: 'active',
    lastAccessedAt: null,
    scope: 'global',
    assistantId: null,
    source: 'manual',
    pinned: false,
    confidence: 0.8,
    subjectKey: null,
    version: 1,
    supersededBy: null,
    validFrom: null,
    validTo: null,
    ttlAt: null,
    lastConfirmedAt: null,
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

const RAW = JSON.stringify({
  story: { title: '画像测试', theme: '称呼测试', tags: ['称呼'] },
  scene: {
    id: 'gen.profile',
    triggers: ['touch::body::tap'],
    priority: 2,
    cooldownMs: 180_000,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      { at: 0, cue: { kind: 'line', pool: 'head-tap' } },
      { at: 12_000, cue: { kind: 'expression', tag: 'joy', holdMs: 1500 } },
      { at: 24_000, cue: { kind: 'line', pool: 'ambient' } },
      { at: 36_000, cue: { kind: 'wait', ms: 2000 } },
      { at: 48_000, cue: { kind: 'line', pool: 'work-rest' } },
      { at: 60_000, cue: { kind: 'look', target: 'camera' } },
      { at: 72_000, cue: { kind: 'line', pool: 'body-tap' } },
    ],
  },
});

describe('M3 用户画像（剧本生成背景）', () => {
  it('只保留 active 的画像类记忆，过滤事件与空白', () => {
    const selected = selectProfileMemories([
      memory('1', 'fact', '用户叫小林'),
      memory('2', 'event', '昨天一起看了电影'),
      memory('3', 'preference', '用户喜欢热茶', { status: 'archived' }),
      memory('4', 'constraint', '  '),
      memory('5', 'relationship', '一起熬夜改过稿'),
    ]);
    expect(selected.map((item) => item.id)).toEqual(['1', '5']);
  });

  it('置顶优先，其次按重要度，最多 8 条', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      memory(String(index), 'fact', `事实 ${index}`, { importance: index / 10 }),
    );
    many[9] = { ...many[9]!, pinned: true };
    const selected = selectProfileMemories(many);
    expect(selected).toHaveLength(PROFILE_MAX_MEMORIES);
    expect(selected[0]?.id).toBe('9');
  });

  it('按字符上限截断，空输入返回 null', () => {
    const long = '很长的偏好'.repeat(200);
    const block = profileContextForPrompt([memory('1', 'preference', long)]);
    expect(block).toBeNull();
    expect(profileContextForPrompt([])).toBeNull();

    const lines = profileContextForPrompt([
      memory('1', 'constraint', '不吃香菜'),
      memory('2', 'fact', '用户叫小林'),
    ]);
    expect(lines).toContain('[约束] 不吃香菜');
    expect(lines).toContain('[事实] 用户叫小林');
  });

  it('生成时注入画像；记忆读取失败降级为普通用户', async () => {
    const prompts: Array<{ system: string; user: string }> = [];
    const profile = [memory('1', 'fact', '用户叫小林'), memory('2', 'constraint', '不吃香菜')];
    const store = {
      state: null as PetScriptGenerationState | null,
      load: () => store.state,
      save: (state: PetScriptGenerationState) => {
        store.state = state;
      },
    };
    const generator = createPetScriptGenerator({
      store,
      storyStore: { load: () => null, save: () => {} },
      memories: () => profile,
      resolveTarget: () => ({ model: { modelId: 'mock' }, provider: {} }) as ResolvedChatTarget,
      complete: async (_target, params) => {
        prompts.push(params);
        return RAW;
      },
      now: () => new Date(2026, 10, 14, 12),
      random: () => 0,
    });
    expect((await generator.generate({})).ok).toBe(true);
    expect(prompts[0]?.system).toContain('用户画像');
    expect(prompts[0]?.user).toContain('用户叫小林');
    expect(prompts[0]?.user).toContain('不吃香菜');

    const broken = createPetScriptGenerator({
      store: { load: () => null, save: () => {} },
      storyStore: { load: () => null, save: () => {} },
      memories: () => {
        throw new Error('db down');
      },
      resolveTarget: () => ({ model: { modelId: 'mock' }, provider: {} }) as ResolvedChatTarget,
      complete: async (_target, params) => {
        prompts.push(params);
        return RAW;
      },
      now: () => new Date(2026, 10, 14, 12),
      random: () => 0,
    });
    expect((await broken.generate({})).ok).toBe(true);
    expect(prompts[1]?.user).toContain('暂无可用画像');
  });
});
