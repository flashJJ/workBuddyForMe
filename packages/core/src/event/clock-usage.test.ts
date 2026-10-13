import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWallClock, createManualClock } from './clock';
import { InMemoryEventUsageStore } from './usage-store';

describe('WallClock（假定时器）', () => {
  afterEach(() => vi.useRealTimers());

  it('sleep 正常超时与 abort 提前返回', async () => {
    vi.useFakeTimers();
    const clock = createWallClock();
    const ctrl = new AbortController();
    const p = clock.sleep(1000, ctrl.signal);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(false);

    const ctrl2 = new AbortController();
    const p2 = clock.sleep(5000, ctrl2.signal);
    ctrl2.abort();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p2).resolves.toBe(true);

    // 已 abort 的 sleep 立即返回
    await expect(clock.sleep(1000, ctrl2.signal)).resolves.toBe(true);
  });

  it('timeout 到期触发、可取消', () => {
    vi.useFakeTimers();
    const clock = createWallClock();
    const cb = vi.fn();
    clock.timeout(cb, 1000);
    vi.advanceTimersByTime(999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);

    const cb2 = vi.fn();
    const cancel = clock.timeout(cb2, 2000);
    cancel();
    vi.advanceTimersByTime(3000);
    expect(cb2).not.toHaveBeenCalled();
  });
});

describe('ManualClock', () => {
  it('sleep 立即推进；advance 触发到期定时器并保序', async () => {
    const clock = createManualClock(0);
    const order: number[] = [];
    clock.timeout(() => order.push(2), 20);
    clock.timeout(() => order.push(1), 10);
    const p = clock.sleep(5);
    expect(clock.now()).toBe(5);
    await expect(p).resolves.toBe(false);
    clock.advance(25);
    expect(clock.now()).toBe(30);
    expect(order).toEqual([1, 2]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('取消的定时器 advance 不触发', () => {
    const clock = createManualClock(100);
    const cb = vi.fn();
    const cancel = clock.timeout(cb, 10);
    cancel();
    clock.advance(50);
    expect(cb).not.toHaveBeenCalled();
  });

  it('sleep 响应 abort', async () => {
    const clock = createManualClock();
    const ctrl = new AbortController();
    const p = clock.sleep(1000, ctrl.signal);
    ctrl.abort();
    await expect(p).resolves.toBe(true);
  });
});

describe('InMemoryEventUsageStore', () => {
  it('冷却锚点只认 played；按日计数；四态统计', () => {
    const store = new InMemoryEventUsageStore({ toDateKey: (ms) => new Date(ms).toISOString().slice(0, 10) });
    store.record({ eventId: 'ev.a', playedAt: 1000, outcome: 'played', priority: 1 });
    store.record({ eventId: 'ev.a', playedAt: 2000, outcome: 'suppressed', reason: 'cooldown', priority: 1 });
    store.record({ eventId: 'ev.a', playedAt: 3000, outcome: 'skipped', reason: 'user_skip', priority: 1 });
    expect(store.lastPlayedAt('ev.a')).toBe(1000);
    expect(store.countPlayedToday('ev.a', '1970-01-01')).toBe(1);

    const stats = store.stats(0);
    expect(stats).toMatchObject({ played: 1, suppressed: 1, skipped: 1, interrupted: 0 });
  });
});
