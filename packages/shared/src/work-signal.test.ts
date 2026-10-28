import { describe, expect, it } from 'vitest';
import {
  activityForTool,
  aggregateWorkSignals,
  pruneWorkSignals,
  sortWorkSignals,
  type WorkApproval,
  type WorkSignal,
} from './work-signal';

const now = Date.parse('2026-10-29T00:00:00.000Z');

function signal(patch: Partial<WorkSignal> = {}): WorkSignal {
  return {
    key: 'task:t1',
    source: 'task',
    runId: 't1',
    title: '整理资料',
    outcome: 'running',
    attention: 'none',
    activity: 'thinking',
    stepLabel: null,
    completedSteps: 1,
    totalSteps: 10,
    startedAt: '2026-10-28T23:59:00.000Z',
    updatedAt: '2026-10-28T23:59:30.000Z',
    endedAt: null,
    errorReason: null,
    deepLink: '/tasks?run=t1',
    ...patch,
  };
}

const approval: WorkApproval = {
  id: 'flow:r1:human:review',
  source: 'flow',
  title: '人工审核',
  tool: null,
  permission: null,
  argsSummary: null,
  runId: 'r1',
  conversationId: null,
  createdAt: '2026-10-28T23:59:30.000Z',
  expiresAt: null,
  deepLink: '/flows/w1?run=r1',
};

describe('work-signal 纯函数', () => {
  it('工具名映射到活动类型', () => {
    expect(activityForTool('knowledge_search')).toBe('searching');
    expect(activityForTool('read_file')).toBe('reading');
    expect(activityForTool('write_file')).toBe('writing');
    expect(activityForTool('run_command')).toBe('executing');
    expect(activityForTool('verify')).toBe('verifying');
    expect(activityForTool(null)).toBe('thinking');
  });

  it('终态信号保留 60 秒，运行中永不按时间丢弃', () => {
    const live = signal({ updatedAt: '2026-10-01T00:00:00.000Z' });
    const recent = signal({
      key: 'task:t2',
      runId: 't2',
      outcome: 'succeeded',
      endedAt: '2026-10-28T23:59:30.000Z',
    });
    const stale = signal({
      key: 'task:t3',
      runId: 't3',
      outcome: 'failed',
      endedAt: '2026-10-28T23:58:00.000Z',
    });
    expect(pruneWorkSignals([live, recent, stale], now).map((s) => s.key)).toEqual([
      'task:t1',
      'task:t2',
    ]);
  });

  it('审批优先于任何运行态，主运行按 runId 关联', () => {
    const flow = signal({
      key: 'flow:r1',
      source: 'flow',
      runId: 'r1',
      outcome: 'waiting',
      attention: 'input',
      title: '发布流程',
    });
    const view = aggregateWorkSignals([signal(), flow], [approval], now);
    expect(view.base).toBe('waiting');
    expect(view.primary?.runId).toBe('r1');
    expect(view.approvalCount).toBe(1);
  });

  it('最近失败在 15 秒窗口内进入 ERROR 脉冲', () => {
    const view = aggregateWorkSignals(
      [
        signal({
          outcome: 'failed',
          endedAt: '2026-10-28T23:59:50.000Z',
          updatedAt: '2026-10-28T23:59:50.000Z',
          errorReason: '工具失败',
        }),
      ],
      [],
      now,
    );
    expect(view.base).toBe('error');
    expect(view.pulse).toBe('error');
    expect(view.headline).toBe('工具失败');
  });

  it('进行中取最近更新；thinking 走 THINKING，其余走 WORKING', () => {
    const older = signal({ key: 'task:old', runId: 'old', updatedAt: '2026-10-28T23:59:00.000Z' });
    const latest = signal({
      key: 'task:new',
      runId: 'new',
      activity: 'searching',
      updatedAt: '2026-10-28T23:59:40.000Z',
    });
    const view = aggregateWorkSignals([older, latest], [], now);
    expect(view.base).toBe('working');
    expect(view.primary?.runId).toBe('new');
    expect(view.runningCount).toBe(2);
  });

  it('完成在 15 秒窗口内进入 SUCCESS 脉冲，之后回落 IDLE', () => {
    const done = signal({
      outcome: 'succeeded',
      endedAt: '2026-10-28T23:59:50.000Z',
      updatedAt: '2026-10-28T23:59:50.000Z',
      activity: 'idle',
    });
    expect(aggregateWorkSignals([done], [], now).base).toBe('success');
    const later = now + 20_000;
    expect(aggregateWorkSignals([done], [], later).base).toBe('idle');
  });

  it('排序：审批 > 失败 > 运行 > 排队 > 完成 > 取消', () => {
    const signals = [
      signal({ key: 'task:c', runId: 'c', outcome: 'cancelled' }),
      signal({ key: 'task:s', runId: 's', outcome: 'succeeded' }),
      signal({ key: 'task:q', runId: 'q', outcome: 'queued' }),
      signal({ key: 'task:r', runId: 'r', outcome: 'running' }),
      signal({ key: 'task:f', runId: 'f', outcome: 'failed' }),
      signal({ key: 'flow:a', source: 'flow', runId: 'a', outcome: 'waiting', attention: 'input' }),
    ];
    expect(sortWorkSignals(signals, [{ ...approval, runId: 'a' }]).map((s) => s.runId)).toEqual([
      'a',
      'f',
      'r',
      'q',
      's',
      'c',
    ]);
  });
});
