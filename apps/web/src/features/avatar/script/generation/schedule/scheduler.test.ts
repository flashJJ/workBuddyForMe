import { describe, expect, it } from 'vitest';
import type {
  PetScriptGenerationResult,
  PetScriptGenerationView,
} from '@wbfm/shared/schemas';
import type { PetScriptGenerator } from '../service';
import { createPetScriptScheduler } from './scheduler';
import type { ScheduleState } from './schedule';

const USAGE = {
  date: '2026-11-13',
  calls: 0,
  tokens: 0,
  callLimit: 3,
  tokenLimit: 20_000,
};
const STORY = { openThreads: 0, recentThemes: [], cliffhanger: null, usedTags: [] };
const VIEW: PetScriptGenerationView = { scenes: [], usage: USAGE, story: STORY };

const at = (hour: number, minute = 0): Date => new Date(2026, 10, 13, hour, minute);

function memoryStore(initial: unknown = null) {
  const box = {
    state: initial,
    load: () => box.state,
    save: (state: ScheduleState) => {
      box.state = state;
    },
  };
  return box;
}

function okResult(over: Partial<PetScriptGenerationResult> = {}): PetScriptGenerationResult {
  return {
    ok: true,
    reason: 'ok',
    scenes: [],
    issues: [],
    usage: USAGE,
    story: STORY,
    modelId: 'mock',
    fallback: false,
    ...over,
  };
}

function setup(options: { generated?: PetScriptGenerationResult; initial?: unknown } = {}) {
  let calls = 0;
  const generator: PetScriptGenerator = {
    list: () => VIEW,
    generate: async () => {
      calls += 1;
      return options.generated ?? okResult();
    },
  };
  const store = memoryStore(options.initial);
  const scheduler = createPetScriptScheduler({ generator, store, now: () => at(10) });
  return { scheduler, store, calls: () => calls };
}

describe('定时入口调度器（P8.5）', () => {
  it('默认关闭：tick 不调用生成器', async () => {
    const { scheduler, calls } = setup();
    const result = await scheduler.tick();
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(calls()).toBe(0);
  });

  it('未到窗口：tick 不调用生成器', async () => {
    const { scheduler, calls } = setup({ initial: { enabled: true } });
    // now 固定 10 点会到期，这里换成 9 点
    const early = createPetScriptScheduler({
      generator: { list: () => VIEW, generate: async () => okResult() },
      store: memoryStore({ enabled: true }),
      now: () => at(9),
    });
    const result = await early.tick();
    expect(result.reason).toBe('not-due');
    expect(calls()).toBe(0);

    // 10 点的实例到期
    expect((await scheduler.tick()).triggered).toBe(true);
    expect(calls()).toBe(1);
  });

  it('到期：生成一次并记窗口；同窗口再次 tick 不再生成', async () => {
    const { scheduler, store, calls } = setup({ initial: { enabled: true } });
    const first = await scheduler.tick();
    expect(first.triggered).toBe(true);
    expect(first.reason).toBe('ok');
    expect(first.schedule.runsToday).toBe(1);
    expect(calls()).toBe(1);
    expect((store.state as ScheduleState).lastRunAt).toBe(at(10).getTime());

    const again = await scheduler.tick();
    expect(again.triggered).toBe(false);
    expect(again.reason).toBe('not-due');
    expect(calls()).toBe(1);
  });

  it('生成失败也消费窗口，返回失败原因', async () => {
    const { scheduler, calls } = setup({
      initial: { enabled: true },
      generated: okResult({ ok: false, reason: 'invalid', issues: ['重复'], fallback: true }),
    });
    const result = await scheduler.tick();
    expect(result.triggered).toBe(true);
    expect(result.reason).toBe('invalid');
    expect(result.issues).toEqual(['重复']);
    expect(result.schedule.runsToday).toBe(1);
    expect(calls()).toBe(1);
  });

  it('开关写入持久化状态', () => {
    const { scheduler, store } = setup();
    expect(scheduler.setEnabled(true)).toMatchObject({ enabled: true });
    expect(store.state).toMatchObject({ enabled: true });
    expect(scheduler.setEnabled(false)).toMatchObject({ enabled: false });
  });
});
