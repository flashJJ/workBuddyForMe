import { describe, expect, it } from 'vitest';
import type { TaskRunView } from '@wbfm/shared';
import { createApprovalRegistry } from './approval-registry';
import { createWorkSignalHub } from './hub';

const run: TaskRunView = {
  id: 't1',
  conversationId: 'c1',
  assistantId: 'a1',
  goal: '整理资料',
  status: 'running',
  stepCount: 0,
  failureCount: 0,
  maxSteps: 10,
  stopReason: null,
  permissionMode: 'confirm_each',
  workspacePath: null,
  originScheduledTaskId: null,
  policyHash: null,
  createdAt: '2026-10-28T23:59:00.000Z',
  updatedAt: '2026-10-28T23:59:00.000Z',
  finishedAt: null,
};

describe('WorkSignalHub', () => {
  it('task 事件进入快照，订阅者收到后续快照', async () => {
    const approvals = createApprovalRegistry();
    const hub = createWorkSignalHub({ approvals });
    hub.ingestTask(run, {
      event: 'task',
      data: { type: 'run_started', runId: 't1', conversationId: 'c1', run },
    });
    expect(hub.snapshot().signals).toHaveLength(1);
    expect(hub.snapshot().signals[0]?.outcome).toBe('running');

    const iterator = hub.subscribe()[Symbol.asyncIterator]();
    const pending = iterator.next();
    hub.ingestTask(run, {
      event: 'task',
      data: {
        type: 'step_finished',
        runId: 't1',
        conversationId: 'c1',
        step: {
          id: 's1',
          runId: 't1',
          stepIndex: 0,
          kind: 'action',
          toolName: 'knowledge_search',
          reason: '',
          argsJson: '{}',
          resultJson: '',
          screenshotPath: '',
          status: 'completed',
          error: '',
          durationMs: 1,
          createdAt: '2026-10-28T23:59:01.000Z',
        },
      },
    });
    const next = await pending;
    expect(next.done).toBe(false);
    expect(next.value?.seq).toBeGreaterThan(1);
    expect(next.value?.signals[0]?.completedSteps).toBe(1);
  });

  it('审批变化触发快照，resolve 后审批消失', () => {
    const approvals = createApprovalRegistry();
    const hub = createWorkSignalHub({ approvals });
    approvals.register(
      {
        id: 'flow:r1:human:review',
        source: 'flow',
        title: '人工审核',
        runId: 'r1',
        deepLink: '/flows/w1?run=r1',
      },
      () => undefined,
    );
    expect(hub.snapshot().approvals).toHaveLength(1);
    approvals.resolve('flow:r1:human:review', { action: 'allow' });
    expect(hub.snapshot().approvals).toHaveLength(0);
  });

  it('clear 清空信号与审批', () => {
    const approvals = createApprovalRegistry();
    const hub = createWorkSignalHub({ approvals });
    hub.ingestTask(run, {
      event: 'task',
      data: { type: 'run_started', runId: 't1', conversationId: 'c1', run },
    });
    approvals.register(
      { id: 'tool:c1', source: 'tool', title: '工具授权', deepLink: '/chat' },
      () => undefined,
    );
    hub.clear();
    expect(hub.snapshot().signals).toHaveLength(0);
    expect(hub.snapshot().approvals).toHaveLength(0);
  });
});
