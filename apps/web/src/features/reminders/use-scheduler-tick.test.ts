// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledTaskView } from '@wbfm/shared/schemas';
import type { WbfmNotifyBridge } from '@wbfm/shared/notify';
import { deliverDueTask } from './use-scheduler-tick';

function task(overrides: Partial<ScheduledTaskView> = {}): ScheduledTaskView {
  return {
    id: 's1',
    assistantId: 'a1',
    kind: 'daily',
    hour: 9,
    minute: 0,
    weekday: null,
    atDate: null,
    timezone: 'Asia/Shanghai',
    text: '该喝水了',
    enabled: true,
    nextRunAt: '2026-10-13T01:00:00.000Z',
    lastFiredAt: null,
    payload: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function handlers(overrides: Partial<{
  currentAssistantId: string;
  hasOutlet: boolean;
  convLocked: boolean;
}> = {}) {
  const deliverReminder = vi.fn(async () => true);
  return {
    handlers: {
      currentAssistantId: 'a1',
      hasOutlet: () => overrides.hasOutlet ?? true,
      isConvLocked: () => overrides.convLocked ?? false,
      deliverReminder,
    },
    deliverReminder,
  };
}

describe('deliverDueTask（v1.7 提醒投递）', () => {
  afterEach(() => {
    delete window.wbfm?.notify;
  });

  it('同助手+有出口+无对话锁：现场演出，不走通知', async () => {
    const setup = handlers();
    const result = await deliverDueTask(task(), setup.handlers, []);
    expect(result).toBe('performed');
    expect(setup.deliverReminder).toHaveBeenCalledWith('该喝水了');
  });

  it('异助手/无出口/对话锁：走系统通知兜底，不触发现场演出', async () => {
    const show = vi.fn(async () => undefined);
    window.wbfm = { ...window.wbfm, notify: { show } as unknown as WbfmNotifyBridge };

    const other = handlers({ currentAssistantId: undefined });
    other.handlers.currentAssistantId = 'a2';
    const byMismatch = await deliverDueTask(task(), other.handlers, [
      { id: 'a1', name: '小狐' },
    ]);
    expect(byMismatch).toBe('notified');
    expect(show).toHaveBeenCalledWith({ title: '小狐', body: '该喝水了' });
    expect(other.deliverReminder).not.toHaveBeenCalled();

    const noOutlet = handlers({ hasOutlet: false });
    expect(await deliverDueTask(task(), noOutlet.handlers, [])).toBe('notified');

    const conv = handlers({ convLocked: true });
    expect(await deliverDueTask(task(), conv.handlers, [])).toBe('notified');
  });

  it('演出回调返回 false（出口竞态消失）时回落通知', async () => {
    const show = vi.fn(async () => undefined);
    window.wbfm = { ...window.wbfm, notify: { show } as unknown as WbfmNotifyBridge };
    const setup = handlers();
    setup.deliverReminder.mockResolvedValue(false);
    const result = await deliverDueTask(task(), setup.handlers, []);
    expect(result).toBe('notified');
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('无通知桥（纯浏览器）且不能演出：dropped 且不抛错', async () => {
    const setup = handlers();
    setup.handlers.currentAssistantId = 'a2';
    await expect(deliverDueTask(task(), setup.handlers, [])).resolves.toBe('dropped');
  });
});
