import { describe, expect, it } from 'vitest';
import { PET_SCRIPT_GENERATION_LIMITS } from '@wbfm/shared/schemas';
import type { ResolvedChatTarget } from '@wbfm/core/chat';
import { createPetScriptGenerator } from './service';
import { localDateKey, type PetScriptGenerationState, type PetScriptGenerationStore } from './state';
import type { DailyTopics } from './topics';

const NOW = new Date(2026, 10, 13, 12, 0);

const VALID_RAW = JSON.stringify({
  id: 'gen.mock-hello',
  triggers: ['touch::body::tap'],
  priority: 2,
  cooldownMs: 180_000,
  interrupt: 'all',
  beats: [
    { at: 0, cue: { kind: 'look', target: 'camera' } },
    { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 2000 } },
    { at: 0, cue: { kind: 'line', pool: 'head-tap' } },
    { at: 12_000, cue: { kind: 'wait', ms: 2000 } },
    { at: 20_000, cue: { kind: 'motion', motion: 'motion.stance-sway' } },
    { at: 28_000, cue: { kind: 'line', pool: 'ambient' } },
    { at: 42_000, cue: { kind: 'gesture', gesture: 'nod', intensity: 0.5 } },
    { at: 56_000, cue: { kind: 'line', pool: 'work-rest' } },
    { at: 70_000, cue: { kind: 'look', target: 'camera' } },
  ],
});

function wrapper(id: string, story: Record<string, unknown>): string {
  return JSON.stringify({
    story,
    scene: {
      id,
      triggers: ['touch::body::tap'],
      priority: 2,
      cooldownMs: 180_000,
      interrupt: 'all',
      beats: [
        { at: 0, cue: { kind: 'look', target: 'camera' } },
        { at: 0, cue: { kind: 'line', pool: 'head-tap' } },
        { at: 12_000, cue: { kind: 'expression', tag: 'joy', holdMs: 1500 } },
        { at: 24_000, cue: { kind: 'wait', ms: 2000 } },
        { at: 34_000, cue: { kind: 'motion', motion: 'motion.stance-sway' } },
        { at: 44_000, cue: { kind: 'line', pool: 'ambient' } },
        { at: 58_000, cue: { kind: 'gesture', gesture: 'tilt', intensity: 0.4 } },
        { at: 72_000, cue: { kind: 'line', pool: 'work-rest' } },
      ],
    },
  });
}

const CLIFFHANGER_RAW = wrapper('gen.tea-cooling', {
  title: '茶凉了',
  theme: '喝茶等待',
  tags: ['茶', '等待'],
  cliffhanger: '茶杯凉了还没喝',
});

const RESOLVE_RAW = wrapper('gen.tea-drink', {
  title: '把茶喝了',
  theme: '喝茶收尾',
  tags: ['茶', '收尾'],
  resolves: '茶杯凉了还没喝',
});

const target = {
  model: { modelId: 'mock-model' },
  provider: {},
} as unknown as ResolvedChatTarget;

function memoryStore(initial: unknown = null): PetScriptGenerationStore & { state: unknown } {
  const box = {
    state: initial,
    load: () => box.state,
    save: (state: PetScriptGenerationState) => {
      box.state = state;
    },
  };
  return box;
}

function memoryStoryStore(initial: unknown = null) {
  const box = {
    state: initial,
    load: () => box.state,
    save: (state: unknown) => {
      box.state = state;
    },
  };
  return box;
}

function setup(options: {
  raw?: string | (() => string);
  store?: PetScriptGenerationStore;
  storyStore?: ReturnType<typeof memoryStoryStore>;
  topics?: { today(): Promise<DailyTopics> };
  fail?: Error;
} = {}) {
  const prompts: Array<{ system: string; user: string }> = [];
  const storyStore = options.storyStore ?? memoryStoryStore();
  const generator = createPetScriptGenerator({
    store: options.store ?? memoryStore(),
    storyStore,
    topics: options.topics,
    resolveTarget: () => target,
    complete: async (_target, params) => {
      prompts.push(params);
      if (options.fail) throw options.fail;
      const raw = options.raw ?? VALID_RAW;
      return typeof raw === 'function' ? raw() : raw;
    },
    now: () => NOW,
    random: () => 0,
  });
  return { generator, prompts, storyStore };
}

describe('剧本生成服务（P8.3）', () => {
  it('合法输出入队并累计用量', async () => {
    const { generator, prompts } = setup();
    const result = await generator.generate({ trigger: 'touch::body::tap' });

    expect(result.ok).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.scenes.map((scene) => scene.id)).toEqual(['gen.mock-hello']);
    expect(result.usage.calls).toBe(1);
    expect(result.usage.tokens).toBeGreaterThan(0);
    expect(result.modelId).toBe('mock-model');
    expect(result.story.recentThemes[0]).toBe('mock hello');
    expect(prompts[0]?.user).toContain('touch::body::tap');
    expect(prompts[0]?.system).toContain('桌宠剧本编排器');
    expect(generator.list().scenes).toHaveLength(1);
  });

  it('P8.6：今日时事注入提示词，搜索失败不阻断生成', async () => {
    const topics: DailyTopics = {
      date: '2026-11-13',
      fetchedAt: NOW.getTime(),
      items: ['城市马拉松周末开跑', '新款折叠屏发布'],
      provider: 'mock',
      error: null,
    };
    const withTopics = setup({ topics: { today: async () => topics } });
    expect((await withTopics.generator.generate({})).ok).toBe(true);
    expect(withTopics.prompts[0]?.user).toContain('城市马拉松周末开跑');
    expect(withTopics.prompts[0]?.user).toContain('今日时事');

    const failed: DailyTopics = { ...topics, items: [], error: '联网搜索未启用' };
    const withoutTopics = setup({ topics: { today: async () => failed } });
    expect((await withoutTopics.generator.generate({})).ok).toBe(true);
    expect(withoutTopics.prompts[0]?.user).toContain('今天没有可用话题');
  });

  it('非法输出回落：不落场景，但消耗一次调用与估算 token', async () => {
    const { generator } = setup({ raw: '这不是 JSON' });
    const result = await generator.generate({});

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid');
    expect(result.fallback).toBe(true);
    expect(result.scenes).toEqual([]);
    expect(result.usage.calls).toBe(1);
    expect(result.usage.tokens).toBeGreaterThan(0);
  });

  it('供应商失败回落：只消耗调用，不记 token', async () => {
    const { generator } = setup({ fail: new Error('no provider') });
    const result = await generator.generate({});

    expect(result.reason).toBe('provider');
    expect(result.issues.join('')).toContain('no provider');
    expect(result.usage).toMatchObject({ calls: 1, tokens: 0 });
    expect(result.scenes).toEqual([]);
  });

  it('每日调用上限：达到上限后不再请求模型', async () => {
    const limit = PET_SCRIPT_GENERATION_LIMITS.dailyCalls;
    const store = memoryStore({
      date: localDateKey(NOW),
      calls: limit,
      tokens: 0,
      scenes: [],
    });
    let called = false;
    const generator = createPetScriptGenerator({
      store,
      storyStore: memoryStoryStore(),
      resolveTarget: () => target,
      complete: async () => {
        called = true;
        return VALID_RAW;
      },
      now: () => NOW,
    });

    const result = await generator.generate({});
    expect(result.reason).toBe('daily-cap');
    expect(called).toBe(false);
    expect(result.usage.calls).toBe(limit);
  });

  it('P8.4：留下悬念 → 下次上下文可续接，resolves 收线', async () => {
    const raws = [CLIFFHANGER_RAW, RESOLVE_RAW];
    const { generator, prompts } = setup({ raw: () => raws.shift() ?? RESOLVE_RAW });

    const first = await generator.generate({});
    expect(first.ok).toBe(true);
    expect(first.story.cliffhanger).toBe('茶杯凉了还没喝');
    expect(first.story.openThreads).toBe(1);

    const second = await generator.generate({});
    expect(second.ok).toBe(true);
    expect(second.story.cliffhanger).toBeNull();
    expect(second.story.openThreads).toBe(0);
    expect(prompts[1]?.user).toContain('茶杯凉了还没喝');
    expect(generator.list().story.openThreads).toBe(0);
  });

  it('P8.4：同主题/同梗重复的候选被拒绝，不落场景', async () => {
    const { generator } = setup({ raw: CLIFFHANGER_RAW });
    expect((await generator.generate({})).ok).toBe(true);

    const duplicate = await generator.generate({});
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toBe('invalid');
    expect(duplicate.issues.join('')).toMatch(/重复/);
    expect(duplicate.scenes).toHaveLength(1);
    expect(duplicate.usage.calls).toBe(2);
  });
});
