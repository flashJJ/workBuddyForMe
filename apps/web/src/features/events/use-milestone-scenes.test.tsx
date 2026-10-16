// @vitest-environment jsdom
'use client';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RelationshipMilestoneRecord } from '@wbfm/shared/schemas';
import { useMilestoneScenes } from './use-milestone-scenes';

let milestones: RelationshipMilestoneRecord[] = [];

vi.mock('@/lib/hooks/use-relationship-milestones', () => ({
  useRelationshipMilestones: () => ({ data: milestones }),
}));

function record(key: string): RelationshipMilestoneRecord {
  return {
    id: `milestone:a1:${key}`,
    assistantId: 'a1',
    milestoneKey: key,
    achievedAt: '2026-10-15T08:00:00.000Z',
    payload: {},
  };
}

const baseArgs = {
  assistantId: 'a1',
  relationshipEnabled: true,
  eventsEnabled: true,
  hasOutlet: true,
  convLocked: false,
};

describe('useMilestoneScenes（v2.0 M2 纪念演出）', () => {
  beforeEach(() => {
    window.localStorage.clear();
    milestones = [];
  });

  it('首次挂载已有成就只立基线，不补演', () => {
    milestones = [record('day_1')];
    const triggerEvent = vi.fn();
    renderHook(() => useMilestoneScenes({ ...baseArgs, triggerEvent }));
    expect(triggerEvent).not.toHaveBeenCalled();
    const seen = JSON.parse(window.localStorage.getItem('wbfm:milestones-seen:a1')!);
    expect(seen).toContain('day_1');
  });

  it('轮询发现新成就 → 触发对应纪念剧本，且只触发一次', () => {
    const triggerEvent = vi.fn();
    const { rerender } = renderHook(
      ({ data }) => {
        milestones = data;
        return useMilestoneScenes({ ...baseArgs, triggerEvent });
      },
      { initialProps: { data: [] as RelationshipMilestoneRecord[] } },
    );
    expect(triggerEvent).not.toHaveBeenCalled();

    rerender({ data: [record('day_1')] });
    expect(triggerEvent).toHaveBeenCalledOnce();
    expect(triggerEvent).toHaveBeenCalledWith('ev.milestone.day1');

    rerender({ data: [record('day_1')] });
    expect(triggerEvent).toHaveBeenCalledOnce();
  });

  it('无出口/对话锁/事件关/养成关：达成也不触发，但仍记入已见（恢复条件后不补演）', () => {
    const triggerEvent = vi.fn();
    const { rerender } = renderHook(
      ({ gate, data }) => {
        milestones = data;
        return useMilestoneScenes({ ...baseArgs, triggerEvent, ...gate });
      },
      {
        initialProps: {
          gate: { hasOutlet: false, convLocked: false, eventsEnabled: true, relationshipEnabled: true },
          data: [] as RelationshipMilestoneRecord[],
        },
      },
    );
    rerender({
      gate: { hasOutlet: false, convLocked: false, eventsEnabled: true, relationshipEnabled: true },
      data: [record('collab_10')],
    });
    expect(triggerEvent).not.toHaveBeenCalled();

    // 条件恢复后重渲染（成就集合未变）：不补演
    rerender({
      gate: { hasOutlet: true, convLocked: false, eventsEnabled: true, relationshipEnabled: true },
      data: [record('collab_10')],
    });
    expect(triggerEvent).not.toHaveBeenCalled();
  });

  it('切助手：已见集合按助手隔离，互不补演', () => {
    const triggerEvent = vi.fn();
    const { rerender } = renderHook(
      ({ assistantId, data }) => {
        milestones = data;
        return useMilestoneScenes({ ...baseArgs, assistantId, triggerEvent });
      },
      { initialProps: { assistantId: 'a1', data: [record('day_1')] } },
    );
    expect(triggerEvent).not.toHaveBeenCalled();

    // a2 首次即有 day_1（旧成就）：基线不演
    rerender({
      assistantId: 'a2',
      data: [{ ...record('day_1'), id: 'milestone:a2:day_1', assistantId: 'a2' }],
    });
    expect(triggerEvent).not.toHaveBeenCalled();

    // a2 之后新达成 day_30：演 a2 的剧本
    rerender({
      assistantId: 'a2',
      data: [
        { ...record('day_1'), id: 'milestone:a2:day_1', assistantId: 'a2' },
        { ...record('day_30'), id: 'milestone:a2:day_30', assistantId: 'a2' },
      ],
    });
    expect(triggerEvent).toHaveBeenCalledOnce();
    expect(triggerEvent).toHaveBeenCalledWith('ev.milestone.day30');
  });
});
