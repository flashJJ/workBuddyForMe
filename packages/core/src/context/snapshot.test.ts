import { describe, expect, it, vi } from 'vitest';
import type { SessionLogService } from '../session-log/session-log-service';
import { CONTEXT_SCENE_SNAPSHOT_EVENT, recordSceneSnapshot } from './snapshot';

const payload = {
  scene: 'collab_plan' as const,
  role: 'planner' as const,
  contextWindow: 4096,
  usableWindow: 3686,
  reserveTokens: 614,
  budgetTokens: 3008,
  promptTokens: 1000,
  truncatedMessages: 0,
  droppedMessages: 0,
  truncated: false,
};

describe('recordSceneSnapshot', () => {
  it('按 scope/scopeId 写入 context_scene_snapshot（best-effort）', () => {
    const record = vi.fn();
    recordSceneSnapshot(
      { events: { record } as unknown as SessionLogService },
      { scope: 'agent', scopeId: 'run-1', payload },
    );
    expect(record).toHaveBeenCalledWith({
      scope: 'agent',
      scopeId: 'run-1',
      type: CONTEXT_SCENE_SNAPSHOT_EVENT,
      payload,
    });
  });

  it('未配置事件服务时静默跳过', () => {
    expect(() =>
      recordSceneSnapshot(null, { scope: 'task', scopeId: 't1', payload }),
    ).not.toThrow();
  });
});
