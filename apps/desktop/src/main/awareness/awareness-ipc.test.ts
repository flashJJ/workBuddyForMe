import { describe, expect, it, vi } from 'vitest';
import type { AwarenessEvent } from '@wbfm/shared/awareness';
import {
  registerAwarenessIpc,
  type AwarenessIpcMainLike,
  type AwarenessPowerMonitorLike,
  type AwarenessTimerLike,
} from './awareness-ipc';

interface FakePowerMonitor extends AwarenessPowerMonitorLike {
  registered: Map<string, () => void>;
  idleSeconds: number;
  emit(channel: string): void;
}

function fakePowerMonitor(idleSeconds = 0): FakePowerMonitor {
  const registered = new Map<string, () => void>();
  const state = { idleSeconds };
  return {
    registered,
    get idleSeconds() {
      return state.idleSeconds;
    },
    set idleSeconds(value: number) {
      state.idleSeconds = value;
    },
    on: (channel, listener) => void registered.set(channel, listener),
    off: (channel) => void registered.delete(channel),
    getSystemIdleTime: () => state.idleSeconds,
    emit(channel: string) {
      registered.get(channel)?.();
    },
  };
}

function fakeTimers(): AwarenessTimerLike & { run(): void; count: () => number } {
  let cb: (() => void) | null = null;
  return {
    count: () => (cb ? 1 : 0),
    run: () => cb?.(),
    setInterval: (fn) => {
      cb = fn;
      return 1;
    },
    clearInterval: () => {
      cb = null;
    },
  };
}

describe('awareness-ipc（v2.0 M3 系统事件感知，默认关 + 显式武装）', () => {
  it('未武装时不挂任何电源监听、不轮询', () => {
    const pm = fakePowerMonitor();
    const broadcast = vi.fn();
    const timers = fakeTimers();
    registerAwarenessIpc({
      ipc: { handle: vi.fn(), removeHandler: vi.fn() },
      powerMonitor: pm,
      broadcast,
      timers,
    });
    expect(pm.registered.size).toBe(0);
    expect(timers.count()).toBe(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('set-enabled(true) 后：挂 4 个电源通道、立即补一个空闲样本、轮询广播', async () => {
    const pm = fakePowerMonitor(42);
    const events: AwarenessEvent[] = [];
    const timers = fakeTimers();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc: AwarenessIpcMainLike = {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: vi.fn(),
    };
    registerAwarenessIpc({
      ipc,
      powerMonitor: pm,
      broadcast: (e) => events.push(e),
      timers,
      now: () => 1000,
    });

    await handlers.get('awareness:set-enabled')?.(null, true);
    expect([...pm.registered.keys()].sort()).toEqual(
      ['lock-screen', 'resume', 'suspend', 'unlock-screen'].sort(),
    );
    expect(events).toEqual([{ type: 'idle', at: 1000, idleSeconds: 42 }]);

    pm.idleSeconds = 7;
    timers.run();
    expect(events.at(-1)).toEqual({ type: 'idle', at: 1000, idleSeconds: 7 });

    pm.emit('unlock-screen');
    pm.emit('lock-screen');
    pm.emit('resume');
    pm.emit('suspend');
    expect(events.slice(-4)).toEqual([
      { type: 'unlock', at: 1000 },
      { type: 'lock', at: 1000 },
      { type: 'resume', at: 1000 },
      { type: 'suspend', at: 1000 },
    ]);
  });

  it('重复武装幂等；set-enabled(false) 拆除全部监听与定时器', async () => {
    const pm = fakePowerMonitor(1);
    const timers = fakeTimers();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerAwarenessIpc({
      ipc: {
        handle: (channel, listener) => handlers.set(channel, listener),
        removeHandler: vi.fn(),
      },
      powerMonitor: pm,
      broadcast: vi.fn(),
      timers,
    });

    await handlers.get('awareness:set-enabled')?.(null, true);
    await handlers.get('awareness:set-enabled')?.(null, true);
    expect(pm.registered.size).toBe(4);
    expect(timers.count()).toBe(1);

    await handlers.get('awareness:set-enabled')?.(null, false);
    expect(pm.registered.size).toBe(0);
    expect(timers.count()).toBe(0);

    // 再次关闭为 no-op
    await handlers.get('awareness:set-enabled')?.(null, false);
    expect(pm.registered.size).toBe(0);
  });

  it('非法负载忽略；注销函数停采集并 removeHandler', async () => {
    const pm = fakePowerMonitor();
    const timers = fakeTimers();
    const removeHandler = vi.fn();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const dispose = registerAwarenessIpc({
      ipc: {
        handle: (channel, listener) => handlers.set(channel, listener),
        removeHandler,
      },
      powerMonitor: pm,
      broadcast: vi.fn(),
      timers,
    });

    await handlers.get('awareness:set-enabled')?.(null, 'yes');
    expect(pm.registered.size).toBe(0);
    await handlers.get('awareness:set-enabled')?.(null, 1);
    expect(pm.registered.size).toBe(0);

    await handlers.get('awareness:set-enabled')?.(null, true);
    expect(pm.registered.size).toBe(4);
    dispose();
    expect(pm.registered.size).toBe(0);
    expect(timers.count()).toBe(0);
    expect(removeHandler).toHaveBeenCalledWith('awareness:set-enabled');
  });
});
