import { describe, expect, it, vi } from 'vitest';
import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowEventBus } from '../queue/event-bus';
import { createChatInvoker } from './chat-invoke';

function fakeBus(): { bus: FlowEventBus; dispose: ReturnType<typeof vi.fn> } {
  const dispose = vi.fn();
  return { bus: { publish: vi.fn(), dispose } as unknown as FlowEventBus, dispose };
}

describe('createChatInvoker（事件缓冲与 override 回收）', () => {
  it('终态返回与执行体抛错都回收该 run 的事件缓冲', async () => {
    const { bus, dispose } = fakeBus();
    const releaseRun = vi.fn();
    let mode: 'ok' | 'throw' = 'ok';
    const invoke = createChatInvoker({
      loadCompiledPublished: () =>
        ({
          version: 1,
          graph: { nodes: [], edges: [] },
          compiled: {},
        }) as never,
      createChatRun: () => 'run-1',
      executor: {
        execute() {
          return (async function* () {
            if (mode === 'throw') throw new Error('boom');
            yield {
              type: 'run_succeeded',
              runId: 'run-1',
              workflowId: 'wf',
              output: 'ok',
            } as FlowEventPayload;
          })();
        },
      } as never,
      bus,
      releaseRun,
    });

    await expect(invoke('wf', {})).resolves.toMatchObject({ ok: true });
    expect(dispose).toHaveBeenCalledWith('run-1');
    expect(releaseRun).toHaveBeenCalledWith('run-1');

    mode = 'throw';
    await expect(invoke('wf', {})).rejects.toThrow('boom');
    expect(dispose).toHaveBeenCalledTimes(2);
    // 抛错路径同样回收 override：否则失败的调用也会留下一条
    expect(releaseRun).toHaveBeenCalledTimes(2);
  });
});
