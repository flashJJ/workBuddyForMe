import { describe, expect, it } from 'vitest';
import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import {
  latestByScene,
  parseSceneSnapshotEntries,
  summarizeSceneSnapshots,
  type SceneSnapshotEntry,
} from './scene-snapshot-events';

function payload(
  patch: Partial<SceneContextSnapshotPayload> = {},
): SceneContextSnapshotPayload {
  return {
    scene: 'collab_plan',
    role: 'planner',
    contextWindow: 4096,
    usableWindow: 3686,
    reserveTokens: 614,
    budgetTokens: 3008,
    promptTokens: 466,
    truncatedMessages: 0,
    droppedMessages: 0,
    truncated: false,
    ...patch,
  };
}

function entry(
  patch: Partial<SceneContextSnapshotPayload> = {},
  id = 'e1',
): SceneSnapshotEntry {
  return { id, at: '2026-11-19T00:00:00.000Z', value: payload(patch) };
}

describe('parseSceneSnapshotEntries', () => {
  it('只保留合法场景快照，跳过其他事件与无效载荷', () => {
    const entries = parseSceneSnapshotEntries([
      { id: '1', at: 't1', type: 'agent_phase', payload: { phase: 'plan' } },
      { id: '2', at: 't2', type: 'context_scene_snapshot', payload: payload() },
      { id: '3', at: 't3', type: 'context_scene_snapshot', payload: { scene: 'unknown' } },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('2');
    expect(entries[0]?.value.scene).toBe('collab_plan');
  });

  it('兼容缺少 v4.10 新字段的旧事件', () => {
    const entries = parseSceneSnapshotEntries([
      { id: 'old', at: 't', type: 'context_scene_snapshot', payload: payload() },
    ]);
    expect(entries[0]?.value.systemTokens).toBeUndefined();
  });
});

describe('summarizeSceneSnapshots', () => {
  it('角色取最新一条并按 planner/executor/reviewer 排序', () => {
    const summary = summarizeSceneSnapshots([
      entry({ role: 'executor', scene: 'collab_exec' }, 'a'),
      entry({ role: 'planner', scene: 'collab_plan', promptTokens: 400 }, 'b'),
      entry({ role: 'planner', scene: 'collab_plan', promptTokens: 500 }, 'c'),
      entry({ role: 'reviewer', scene: 'collab_review', promptTokens: 300 }, 'd'),
    ]);
    expect(summary.latestByRole.map((item) => item.role)).toEqual([
      'planner',
      'executor',
      'reviewer',
    ]);
    expect(summary.latestByRole[0]?.entry.value.promptTokens).toBe(500);
    expect(summary.latest?.id).toBe('d');
  });

  it('limit 只保留最近条目并统计截断数', () => {
    const summary = summarizeSceneSnapshots(
      [
        entry({ truncated: true, truncatedMessages: 1 }, 'a'),
        entry({ truncated: false }, 'b'),
        entry({ truncated: true, droppedMessages: 2 }, 'c'),
      ],
      2,
    );
    expect(summary.entries.map((item) => item.id)).toEqual(['b', 'c']);
    expect(summary.truncatedCount).toBe(1);
    expect(summary.hasTruncated).toBe(true);
  });

  it('空输入返回空汇总', () => {
    const summary = summarizeSceneSnapshots([]);
    expect(summary.latest).toBeNull();
    expect(summary.latestByRole).toEqual([]);
    expect(summary.truncatedCount).toBe(0);
    expect(summary.hasTruncated).toBe(false);
  });
});

describe('latestByScene', () => {
  it('任务场景按 scene 取最新并保持首次出现顺序', () => {
    const rows = latestByScene([
      entry({ scene: 'task_start', role: undefined, promptTokens: 54 }, 'a'),
      entry({ scene: 'task_step', role: undefined, promptTokens: 979 }, 'b'),
      entry({ scene: 'task_step', role: undefined, promptTokens: 1200 }, 'c'),
    ]);
    expect(rows.map((row) => row.scene)).toEqual(['task_start', 'task_step']);
    expect(rows[1]?.entry.value.promptTokens).toBe(1200);
  });
});
