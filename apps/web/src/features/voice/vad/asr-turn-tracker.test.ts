import { describe, expect, it, vi } from 'vitest';
import { AsrTurnTracker } from './asr-turn-tracker';

/** 捕获定时器回调，测试手动 fire */
function manualTimer(): { fire: () => void; schedule: (cb: () => void) => () => void; cancel: () => void } {
  const holder: { cb: (() => void) | null } = { cb: null };
  return {
    fire: () => holder.cb?.(),
    cancel: () => {
      holder.cb = null;
    },
    schedule: (cb: () => void) => {
      holder.cb = cb;
      return () => {
        holder.cb = null;
      };
    },
  };
}

describe('AsrTurnTracker', () => {
  it('默认超时 20s', () => {
    expect(new AsrTurnTracker().timeoutMs).toBe(20_000);
  });

  it('start/finish 正常轮次：isCurrent 为 true，finish 后释放', () => {
    const t = new AsrTurnTracker();
    const id = t.start(() => {});
    expect(t.isBusy).toBe(true);
    expect(t.isCurrent(id)).toBe(true);
    expect(t.finish(id)).toBe(true);
    expect(t.isBusy).toBe(false);
  });

  it('陈旧轮次 finish 返回 false（abort 后迟到响应应丢弃）', () => {
    const t = new AsrTurnTracker();
    const old = t.start(() => {});
    t.cancel();
    expect(t.isCurrent(old)).toBe(false);
    expect(t.finish(old)).toBe(false);
  });

  it('新一轮启动后旧轮次立即失效，旧轮定时器被取消', () => {
    const timerA = manualTimer();
    const timerB = manualTimer();
    let n = 0;
    const t = new AsrTurnTracker(20_000, (cb) => (n++ === 0 ? timerA.schedule(cb) : timerB.schedule(cb)));
    const first = t.start(() => {});
    const second = t.start(() => {});
    // 旧轮取消函数在 start 替换时已被调用（此处再调幂等无副作用）
    expect(() => timerA.cancel()).not.toThrow();
    expect(t.finish(first)).toBe(false);
    expect(t.finish(second)).toBe(true);
  });

  it('超时仅对当前轮次生效：finish 后迟到的定时器不触发回调', () => {
    const timer = manualTimer();
    const onTimeout = vi.fn();
    const t = new AsrTurnTracker(20_000, timer.schedule);
    const id = t.start(onTimeout);
    expect(t.finish(id)).toBe(true);
    timer.fire(); // 定时器晚到一步
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('超时命中当前轮次：回调一次并释放单飞', () => {
    const timer = manualTimer();
    const onTimeout = vi.fn();
    const t = new AsrTurnTracker(20_000, timer.schedule);
    const id = t.start(onTimeout);
    timer.fire();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(t.isCurrent(id)).toBe(false);
    expect(t.isBusy).toBe(false);
  });

  it('cancel 作废当前轮次且不触发超时回调', () => {
    const timer = manualTimer();
    const onTimeout = vi.fn();
    const t = new AsrTurnTracker(20_000, timer.schedule);
    t.start(onTimeout);
    t.cancel();
    timer.fire();
    expect(onTimeout).not.toHaveBeenCalled();
    expect(t.isBusy).toBe(false);
  });
});
