// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskEvents } from './use-tasks';

type Listener = (event: MessageEvent) => void;

/** B-50：仅模拟任务 SSE 需要的 EventSource 能力（构造/addEventListener/close） */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closeCount = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  close(): void {
    this.closeCount += 1;
    this.listeners.clear();
  }
}

describe('useTaskEvents（B-50 终态连接回收）', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runId 为空时不建连', () => {
    const { result } = renderHook(() => useTaskEvents(null));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.status).toBe('closed');
  });

  it('收到 run_finished 后主动关闭连接，状态收敛为 closed', async () => {
    const { result } = renderHook(() => useTaskEvents('r1'));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0]!;

    act(() => {
      es.emit('task', { type: 'run_finished' });
    });

    await waitFor(() => expect(result.current.status).toBe('closed'));
    expect(es.closeCount).toBe(1);
  });
});
