import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_INTERVAL_MIN, Live2dIdleScheduler } from './live2d-idle-scheduler';

describe('Live2dIdleScheduler（v3.0 P1 抽取）', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('单链排队动作；睡眠暂停、唤醒重新起链', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // 固定 7s 间隔
    const motion = vi.fn(async () => undefined);
    const scheduler = new Live2dIdleScheduler({
      getModel: () => ({ motion }),
      idleGroup: 'Idle',
      isQuiet: () => true,
      isDisposed: () => false,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(IDLE_INTERVAL_MIN);
    expect(motion).toHaveBeenCalledTimes(1);

    scheduler.setSleeping(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(motion).toHaveBeenCalledTimes(1);

    scheduler.setSleeping(false);
    await vi.advanceTimersByTimeAsync(IDLE_INTERVAL_MIN);
    expect(motion).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('说话/动作期间跳过本轮，继续排下一轮', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let quiet = false;
    const motion = vi.fn(async () => undefined);
    const scheduler = new Live2dIdleScheduler({
      getModel: () => ({ motion }),
      idleGroup: 'Idle',
      isQuiet: () => quiet,
      isDisposed: () => false,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(IDLE_INTERVAL_MIN);
    expect(motion).not.toHaveBeenCalled();

    quiet = true;
    await vi.advanceTimersByTimeAsync(IDLE_INTERVAL_MIN);
    expect(motion).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
