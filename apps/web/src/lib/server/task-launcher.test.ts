import { describe, expect, it, vi } from 'vitest';
import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import { createTaskSnapshotWriter } from './task-launcher';

function stats(truncated: boolean, promptTokens = 100): SceneContextSnapshotPayload {
  return {
    scene: 'task_step',
    role: 'executor',
    contextWindow: 4096,
    usableWindow: 3686,
    reserveTokens: 614,
    budgetTokens: 3008,
    promptTokens,
    truncatedMessages: truncated ? 1 : 0,
    droppedMessages: 0,
    truncated,
  };
}

describe('createTaskSnapshotWriter（v4.9 任务快照节流）', () => {
  it('首条必写，未截断的后续决策不写', () => {
    const record = vi.fn();
    const write = createTaskSnapshotWriter(record);
    write(stats(false));
    write(stats(false, 200));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0].scene).toBe('task_step');
  });

  it('截断由 false 变 true 时补写，持续截断不重复写', () => {
    const record = vi.fn();
    const write = createTaskSnapshotWriter(record);
    write(stats(false));
    write(stats(true, 300));
    write(stats(true, 400));
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1]![0].truncated).toBe(true);
  });

  it('截断恢复后再次截断会重新补写', () => {
    const record = vi.fn();
    const write = createTaskSnapshotWriter(record);
    write(stats(false));
    write(stats(true));
    write(stats(false));
    write(stats(true));
    expect(record).toHaveBeenCalledTimes(3);
  });
});
