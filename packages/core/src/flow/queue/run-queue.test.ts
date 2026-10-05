import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRunView } from '@wbfm/shared';
import { createFlowRunQueue } from './run-queue';

function runView(id: string): WorkflowRunView {
  return {
    id,
    workflowId: 'wf',
    version: 1,
    trigger: 'manual',
    status: 'queued',
    input: {},
    output: null,
    error: null,
    conversationId: null,
    waitNodeId: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    endpointId: null,
    parentRunId: null,
    resumedFromNode: null,
    interruptReason: null,
  };
}

/** 队列每条目占一个 setImmediate 调度链节点；多轮排空 */
function flush(times = 8): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) return resolve();
      setImmediate(() => step(left - 1));
    };
    step(times);
  });
}

describe('FlowRunQueue（v0.9 单执行者顺序拾取）', () => {
  it('入队执行：claim 成功的 run 顺序执行；重复信号不双跑', async () => {
    const executed: string[] = [];
    const claim = vi.fn((id: string) => runView(id));
    const queue = createFlowRunQueue({
      claim,
      execute: async (run) => {
        executed.push(run.id);
      },
    });
    queue.enqueue('r1');
    queue.enqueue('r1'); // 幂等
    queue.enqueue('r2');
    expect(queue.pendingSize()).toBe(2);
    await flush();
    expect(executed).toEqual(['r1', 'r2']);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(queue.pendingSize()).toBe(0);
  });

  it('claim 失败（已被别处认领/状态不符）的信号跳过，不阻塞后续', async () => {
    const executed: string[] = [];
    const queue = createFlowRunQueue({
      claim: (id) => (id === 'stale' ? null : runView(id)),
      execute: async (run) => {
        executed.push(run.id);
      },
    });
    queue.enqueue('stale');
    queue.enqueue('fresh');
    await flush();
    expect(executed).toEqual(['fresh']);
  });

  it('执行异常被 onError 吞掉，队列继续处理下一个', async () => {
    const onError = vi.fn();
    const queue = createFlowRunQueue({
      claim: (id) => runView(id),
      execute: async (run) => {
        if (run.id === 'boom') throw new Error('炸了');
      },
      onError,
    });
    queue.enqueue('boom');
    queue.enqueue('ok');
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe('boom');
  });
});
