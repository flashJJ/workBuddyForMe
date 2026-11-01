// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiTaskEventBus } from './event-bus';

afterEach(() => uiTaskEventBus.clear());

describe('uiTaskEventBus', () => {
  it('订阅者收到广播，退订后不再收到', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = uiTaskEventBus.subscribe(a);
    const offB = uiTaskEventBus.subscribe(b);
    uiTaskEventBus.emit('success');
    expect(a).toHaveBeenCalledWith('success');
    expect(b).toHaveBeenCalledWith('success');
    offA();
    uiTaskEventBus.emit('failure');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenLastCalledWith('failure');
    offB();
  });

  it('单个监听抛错不影响其他订阅；无监听静默', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    uiTaskEventBus.subscribe(bad);
    uiTaskEventBus.subscribe(good);
    expect(() => uiTaskEventBus.emit('success')).not.toThrow();
    expect(good).toHaveBeenCalledWith('success');
  });
});
