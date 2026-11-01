import { describe, expect, it } from 'vitest';
import { createPendingConfirmations } from './pending-confirmations';

describe('HITL 挂起确认注册表', () => {
  it('resolve allow → request 返回 allow', async () => {
    const confirmations = createPendingConfirmations();
    const promise = confirmations.request('call-1');
    expect(confirmations.size()).toBe(1);
    expect(confirmations.resolve('call-1', 'allow')).toBe(true);
    await expect(promise).resolves.toBe('allow');
    expect(confirmations.size()).toBe(0);
  });

  it('resolve deny → request 返回 deny', async () => {
    const confirmations = createPendingConfirmations();
    const promise = confirmations.request('call-1');
    confirmations.resolve('call-1', 'deny');
    await expect(promise).resolves.toBe('deny');
  });

  it('未知 callId resolve 返回 false', () => {
    const confirmations = createPendingConfirmations();
    expect(confirmations.resolve('missing', 'allow')).toBe(false);
  });

  it('超时自动 deny', async () => {
    const confirmations = createPendingConfirmations(20);
    const promise = confirmations.request('call-timeout');
    await expect(promise).resolves.toBe('deny');
    expect(confirmations.size()).toBe(0);
  });

  it('AbortSignal 中断自动 deny 且移除监听', async () => {
    const confirmations = createPendingConfirmations();
    const controller = new AbortController();
    const promise = confirmations.request('call-abort', controller.signal);
    controller.abort();
    await expect(promise).resolves.toBe('deny');
    expect(confirmations.size()).toBe(0);
  });

  it('重复 resolve 幂等（第二次返回 false）', async () => {
    const confirmations = createPendingConfirmations();
    const promise = confirmations.request('call-1');
    expect(confirmations.resolve('call-1', 'allow')).toBe(true);
    expect(confirmations.resolve('call-1', 'allow')).toBe(false);
    await expect(promise).resolves.toBe('allow');
  });

  it('重复 request 同 callId：旧条目被拒绝，新条目生效', async () => {
    const confirmations = createPendingConfirmations();
    const first = confirmations.request('call-1');
    const second = confirmations.request('call-1');
    confirmations.resolve('call-1', 'allow');
    await expect(first).resolves.toBe('deny');
    await expect(second).resolves.toBe('allow');
  });

  it('clear 清空全部挂起', () => {
    const confirmations = createPendingConfirmations();
    void confirmations.request('a');
    void confirmations.request('b');
    expect(confirmations.size()).toBe(2);
    confirmations.clear();
    expect(confirmations.size()).toBe(0);
  });
});
