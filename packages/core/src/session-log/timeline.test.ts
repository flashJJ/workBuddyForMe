import { describe, expect, it } from 'vitest';
import type { SessionEventView } from '@wbfm/database';
import { projectTimeline } from './timeline';

function event(type: string, payload: unknown, seq = 1): SessionEventView {
  return {
    id: `e${seq}`,
    scope: 'chat',
    scopeId: 'c1',
    seq,
    type,
    payload,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('projectTimeline（v4.8 上下文事件）', () => {
  it('意图事件展示类型与置信度', () => {
    const [item] = projectTimeline([
      event('turn_intent', { kind: 'follow_up', confidence: 0.72, signals: ['follow-up-reference'] }),
    ]);
    expect(item?.label).toBe('意图：follow_up');
    expect(item?.detail).toContain('confidence=0.72');
  });

  it('压缩事件展示前后 token 与折叠条数', () => {
    const [item] = projectTimeline([
      event('context_condensed', {
        trigger: 'preflight',
        beforeTokens: 9000,
        afterTokens: 4000,
        foldedMessageIds: ['m1', 'm2'],
        degraded: false,
      }),
    ]);
    expect(item?.label).toBe('上下文压缩：preflight');
    expect(item?.detail).toBe('9000 → 4000 tokens, folded=2');
  });

  it('快照事件展示窗口与保留/丢弃条数', () => {
    const [item] = projectTimeline([
      event('context_snapshot', { contextWindow: 32_000, keptMessages: 12, droppedMessages: 3 }),
    ]);
    expect(item?.label).toBe('上下文快照');
    expect(item?.detail).toBe('window=32000, kept=12, dropped=3');
  });

  it('场景快照事件展示场景、预算与截断状态', () => {
    const [item] = projectTimeline([
      event('context_scene_snapshot', {
        scene: 'collab_plan',
        role: 'planner',
        budgetTokens: 3008,
        promptTokens: 2870,
        truncated: false,
      }),
    ]);
    expect(item?.label).toBe('上下文快照：collab_plan');
    expect(item?.detail).toBe('budget=3008, prompt=2870, truncated=false');
  });
});
