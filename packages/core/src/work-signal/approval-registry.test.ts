import { describe, expect, it, vi } from 'vitest';
import { createApprovalRegistry } from './approval-registry';

describe('ApprovalRegistry', () => {
  it('注册后可列出，resolve 调用回调并移除', () => {
    const registry = createApprovalRegistry();
    const onResolve = vi.fn();
    registry.register(
      {
        id: 'flow:r1:human:review',
        source: 'flow',
        title: '人工审核',
        deepLink: '/flows/w1?run=r1',
      },
      onResolve,
    );
    expect(registry.list()).toHaveLength(1);
    expect(registry.resolve('flow:r1:human:review', { action: 'allow', values: { note: 'ok' } })).toBe(
      true,
    );
    expect(onResolve).toHaveBeenCalledWith({ action: 'allow', values: { note: 'ok' } });
    expect(registry.list()).toHaveLength(0);
  });

  it('remove 后不可再 resolve（底层超时/断线清理）', () => {
    const registry = createApprovalRegistry();
    const handle = registry.register(
      { id: 'tool:c1', source: 'tool', title: '工具授权', deepLink: '/chat' },
      vi.fn(),
    );
    handle.remove();
    expect(registry.list()).toHaveLength(0);
    expect(registry.resolve('tool:c1', { action: 'allow' })).toBe(false);
  });

  it('重复 id 会先拒绝旧条目', () => {
    const registry = createApprovalRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.register({ id: 'tool:c1', source: 'tool', title: '旧', deepLink: '/chat' }, first);
    registry.register({ id: 'tool:c1', source: 'tool', title: '新', deepLink: '/chat' }, second);
    expect(first).toHaveBeenCalledWith({ action: 'deny' });
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.title).toBe('新');
  });

  it('变更通知订阅者', () => {
    const registry = createApprovalRegistry();
    const listener = vi.fn();
    const off = registry.subscribe(listener);
    const handle = registry.register(
      { id: 'tool:c1', source: 'tool', title: '工具授权', deepLink: '/chat' },
      vi.fn(),
    );
    expect(listener).toHaveBeenCalled();
    registry.resolve('tool:c1', { action: 'deny' });
    expect(listener).toHaveBeenCalledTimes(2);
    handle.remove();
    off();
    registry.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
