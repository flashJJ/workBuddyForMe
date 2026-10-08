import { describe, expect, it, vi } from 'vitest';
import type { FlowEventPayload } from '@wbfm/shared/types';
import { createFlowEventBus, isTerminalFlowEvent } from './event-bus';

const runStarted = (runId: string): FlowEventPayload => ({
  type: 'run_started',
  runId,
  workflowId: 'wf',
  version: 1,
  trigger: 'manual',
});
const runSucceeded = (runId: string): FlowEventPayload => ({
  type: 'run_succeeded',
  runId,
  workflowId: 'wf',
  output: 'OK',
});

describe('FlowEventBus（v0.9）', () => {
  it('publish 前的事件进入缓冲，后订阅者快照可取；未执行过的 run 为 null', () => {
    const bus = createFlowEventBus();
    expect(bus.snapshot('r1')).toBeNull();
    bus.publish('r1', runStarted('r1'));
    bus.publish('r1', runSucceeded('r1'));
    expect(bus.snapshot('r1')?.map((e) => e.type)).toEqual(['run_started', 'run_succeeded']);
  });

  it('订阅者收到实时事件；取消订阅后不再收到；异常监听者不阻断他人', () => {
    const bus = createFlowEventBus();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const unsubBad = bus.subscribe('r1', bad);
    const unsubGood = bus.subscribe('r1', good);
    bus.publish('r1', runStarted('r1'));
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    unsubBad();
    unsubGood();
    bus.publish('r1', runSucceeded('r1'));
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('不同 run 事件隔离；dispose 回收缓冲', () => {
    const bus = createFlowEventBus();
    const listener = vi.fn();
    bus.subscribe('r1', listener);
    bus.publish('r2', runStarted('r2'));
    expect(listener).not.toHaveBeenCalled();
    expect(bus.dispose('r2')).toBe(1);
    expect(bus.snapshot('r2')).toBeNull();
  });

  it('isTerminalFlowEvent 只认三种 run 收尾事件', () => {
    expect(isTerminalFlowEvent(runSucceeded('r'))).toBe(true);
    expect(isTerminalFlowEvent(runStarted('r'))).toBe(false);
  });
});
