import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceContainer } from '../container';
import { ensureServerScheduler } from '../server-scheduler';

const HOLDER_KEYS = [
  '__WBFM_SERVER_SCHEDULER__',
  '__WBFM_MEMORY_EVENT_ROLLUP__',
  '__WBFM_MEMORY_CONSOLIDATE__',
] as const;

function clearHolder(): void {
  const holder = globalThis as Record<string, unknown>;
  for (const key of HOLDER_KEYS) delete holder[key];
}

function servicesWithFailingTick(onTick: () => void): ServiceContainer {
  return {
    orchestrator: {
      runRelationshipCheckpoint: () => {
        onTick();
        throw new Error('db down');
      },
    },
    relationshipMilestones: { evaluateAll: () => undefined },
    schedules: {
      listDue: () => [],
      markFired: () => undefined,
      get: () => null,
    },
    settings: { get: () => ({}) },
    memories: {
      runEventRollup: () => undefined,
      getStats: () => ({ lastConsolidate: null }),
      consolidate: () => ({ scanned: 0, archived: 0, mergedSubjects: 0, edgesRemoved: 0 }),
    },
  } as unknown as ServiceContainer;
}

describe('ensureServerScheduler（v4.16）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearHolder();
  });

  afterEach(() => {
    clearHolder();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tick 抛错被捕获告警，后续 tick 继续执行', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let ticks = 0;
    ensureServerScheduler(
      servicesWithFailingTick(() => {
        ticks += 1;
      }),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ticks).toBe(1);
    expect(warn).toHaveBeenCalledWith('[scheduler] tick 失败', expect.any(Error));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ticks).toBe(2);
  });
});
