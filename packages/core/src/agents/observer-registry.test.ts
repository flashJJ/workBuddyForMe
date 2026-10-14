import { describe, expect, it } from 'vitest';
import { PendingObserverRegistry } from './observer-registry';

describe('v1.9 M2 PendingObserverRegistry 先到观察者队列', () => {
  it('existing 非空立即返回，不入队等待', async () => {
    const reg = new PendingObserverRegistry<string>();
    const bus = await reg.await('r1', 10, () => 'live-bus');
    expect(bus).toBe('live-bus');
  });

  it('挂起等待者被 publish 原子唤醒（多等待者同帧收到）', async () => {
    const reg = new PendingObserverRegistry<string>();
    const p1 = reg.await('r1', 1000, () => undefined);
    const p2 = reg.await('r1', 1000, () => undefined);
    await Promise.resolve();
    reg.publish('r1', 'bus-1');
    await expect(Promise.all([p1, p2])).resolves.toEqual(['bus-1', 'bus-1']);
  });

  it('fail 放行等待者为 null（未订阅取消/启动失败回落终态回放）', async () => {
    const reg = new PendingObserverRegistry<string>();
    const p = reg.await('r2', 1000, () => undefined);
    reg.fail('r2');
    expect(await p).toBeNull();
  });

  it('超时返回 null 且出队（不残留）', async () => {
    const reg = new PendingObserverRegistry<string>();
    const timed = await reg.await('r3', 5, () => undefined);
    expect(timed).toBeNull();
    // 超时后 publish 不再触达已结束的等待者，也不抛错
    reg.publish('r3', 'late');
  });
});
