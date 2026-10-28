import { describe, expect, it, vi } from 'vitest';
import type { ScheduledTaskView } from '@wbfm/shared/schemas';
import { createSchedulerTick, runSchedulerTick } from './scheduler-tick';

function makeTask(over: Partial<ScheduledTaskView> & { id: string }): ScheduledTaskView {
  return {
    assistantId: 'a1',
    kind: 'daily',
    hour: 9,
    minute: 0,
    weekday: null,
    atDate: null,
    timezone: 'Asia/Shanghai',
    text: '提醒',
    enabled: true,
    nextRunAt: '2026-10-14T01:00:00.000Z',
    lastFiredAt: null,
    payload: null,
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
    ...over,
  };
}

describe('scheduler tick', () => {
  it('无到期项：不标记不投递', async () => {
    const listDue = vi.fn(() => []);
    const markFired = vi.fn();
    const deliver = vi.fn();
    const n = await runSchedulerTick({ listDue, markFired, deliver, now: () => 1000 });
    expect(n).toBe(0);
    expect(markFired).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('先标记后投递：每条标记成功才投递，且投递文本/助手正确', async () => {
    const due = [
      makeTask({ id: 's1', text: '喝水', assistantId: 'a1' }),
      makeTask({ id: 's2', text: '开会', assistantId: 'a2' }),
    ];
    const listDue = vi.fn(() => due);
    const markFired = vi.fn((id: string) => makeTask({ id }));
    const deliver = vi.fn(async () => undefined);
    const n = await runSchedulerTick({ listDue, markFired, deliver, now: () => 5000 });
    expect(n).toBe(2);
    expect(markFired).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', text: '喝水', assistantId: 'a1' }),
    );
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's2', text: '开会', assistantId: 'a2' }),
    );
  });

  it('标记失败的条目不投递；投递抛错不影响其他条', async () => {
    const due = [makeTask({ id: 's1' }), makeTask({ id: 's2' }), makeTask({ id: 's3' })];
    const markFired = vi.fn((id: string) => (id === 's2' ? null : makeTask({ id })));
    const deliver = vi.fn(async (task: { id: string }) => {
      if (task.id === 's1') throw new Error('no outlet');
    });
    const onWarn = vi.fn();
    const n = await runSchedulerTick({
      listDue: () => due,
      markFired,
      deliver,
      onWarn,
      now: () => 5000,
    });
    expect(n).toBe(2); // s1/s3 被接受
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(onWarn).toHaveBeenCalledWith('scheduler.deliverFailed', expect.anything());
  });

  it('createSchedulerTick：tick 内部异常不外泄，返回 0', async () => {
    const tick = createSchedulerTick({
      listDue: () => {
        throw new Error('db down');
      },
      markFired: vi.fn(),
      deliver: vi.fn(),
    });
    await expect(tick()).resolves.toBe(0);
  });
});
