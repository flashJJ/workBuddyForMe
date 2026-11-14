import { describe, expect, it } from 'vitest';
import type {
  PetScriptGenerationResult,
  PetScriptGenerationView,
} from '@wbfm/shared/schemas';
import type { PetScriptGenerator } from '../service';
import { createPetScriptScheduler } from './scheduler';
import type { QuietHours, ScheduleState } from './schedule';

const USAGE = {
  date: '2026-11-13',
  calls: 0,
  tokens: 0,
  callLimit: 3,
  tokenLimit: 20_000,
};
const STORY = { openThreads: 0, recentThemes: [], cliffhanger: null, usedTags: [], recentProps: [] };
const VIEW: PetScriptGenerationView = { scenes: [], usage: USAGE, story: STORY, sceneMeta: {} };

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
    sceneMeta: {},
    modelId: 'mock',
    fallback: false,
    ...over,
  };
}

function setup(
  options: {
    generated?: PetScriptGenerationResult;
    initial?: unknown;
    now?: () => Date;
    quietHours?: () => QuietHours | null;
  } = {},
) {
  let calls = 0;
  const generator: PetScriptGenerator = {
    list: () => VIEW,
    generate: async () => {
      calls += 1;
      return options.generated ?? okResult();
    },
  };
  const store = memoryStore(options.initial);
  const scheduler = createPetScriptScheduler({
    generator,
    store,
    now: options.now ?? (() => at(10)),
    quietHours: options.quietHours,
  });
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

  it('首次 tick 立即生成；满 30 分钟后才再次生成', async () => {
    let clock = at(10);
    const { scheduler, calls } = setup({ initial: { enabled: true }, now: () => clock });

    expect((await scheduler.tick()).triggered).toBe(true);
    expect(calls()).toBe(1);

    clock = at(10, 29);
    expect((await scheduler.tick()).triggered).toBe(false);
    expect(calls()).toBe(1);

    clock = at(10, 30);
    expect((await scheduler.tick()).triggered).toBe(true);
    expect(calls()).toBe(2);
  });

  it('到期：生成一次并记运行时间；间隔内再次 tick 不再生成', async () => {
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

  it('生成失败也消费一次运行，返回失败原因', async () => {
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

  it('勿扰时段内跳过生成且不消耗次数', async () => {
    let clock = at(23, 30);
    const { scheduler, store, calls } = setup({
      initial: { enabled: true },
      now: () => clock,
      quietHours: () => ({ enabled: true, startHour: 23, endHour: 6 }),
    });

    const quiet = await scheduler.tick();
    expect(quiet.triggered).toBe(false);
    expect(quiet.reason).toBe('quiet-hours');
    expect(quiet.schedule.runsToday).toBe(0);
    expect(calls()).toBe(0);

    clock = at(7);
    const woke = await scheduler.tick();
    expect(woke.triggered).toBe(true);
    expect(calls()).toBe(1);
    expect((store.state as ScheduleState).runsToday).toBe(1);
  });

  it('开关与每日次数写入持久化状态', () => {
    const { scheduler, store } = setup();
    expect(scheduler.setEnabled(true)).toMatchObject({ enabled: true });
    expect(store.state).toMatchObject({ enabled: true });
    expect(scheduler.setPerDay(3)).toMatchObject({ perDay: 3 });
    expect(store.state).toMatchObject({ perDay: 3 });
    expect(scheduler.setEnabled(false)).toMatchObject({ enabled: false });
  });
});
