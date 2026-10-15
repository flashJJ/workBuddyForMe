import { describe, expect, it } from 'vitest';
import { dayKeyBetween, evaluateMilestones, type MilestoneStats } from './milestone';

describe('v2.0 M2 里程碑评估纯函数', () => {
  it('dayKeyBetween 整日差与非法输入', () => {
    expect(dayKeyBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(dayKeyBetween('2026-10-15', '2026-11-14')).toBe(30);
    expect(dayKeyBetween('2026-10-15', '2027-10-15')).toBe(365);
    expect(dayKeyBetween('2026-11-14', '2026-10-15')).toBe(0); // 倒挂
    expect(dayKeyBetween('bad', '2026-10-15')).toBe(0);
  });

  it('day 类：首次互动当日即达成 day_1；30/100/365 按 N-1 天差（首日算第 1 天）', () => {
    const stats: MilestoneStats = { firstPositiveDayKey: '2026-10-15', collabDoneCount: 0 };
    expect(evaluateMilestones(stats, '2026-10-15', new Set()).map((d) => d.key)).toEqual([
      'day_1',
    ]);
    // 11-12 = dayDiff 28（第 29 个自然日）：仍只有 day_1
    expect(evaluateMilestones(stats, '2026-11-12', new Set()).map((d) => d.key)).toEqual([
      'day_1',
    ]);
    // 11-13 = dayDiff 29（第 30 个自然日）：day_30 到期
    expect(evaluateMilestones(stats, '2026-11-13', new Set()).map((d) => d.key)).toEqual([
      'day_1',
      'day_30',
    ]);
    // 评估返回所有未达成且到期的里程碑（不做「仅新跨档」过滤）
    expect(evaluateMilestones(stats, '2027-10-15', new Set()).map((d) => d.key)).toEqual([
      'day_1',
      'day_30',
      'day_100',
      'day_365',
    ]);
  });

  it('无正向互动：任何日类都不达成', () => {
    const stats: MilestoneStats = { firstPositiveDayKey: null, collabDoneCount: 0 };
    expect(evaluateMilestones(stats, '2026-10-15', new Set())).toEqual([]);
  });

  it('collab 类：done 计数达阈值才达成；与日类可同批', () => {
    const none: MilestoneStats = { firstPositiveDayKey: null, collabDoneCount: 9 };
    expect(evaluateMilestones(none, '2026-10-15', new Set())).toEqual([]);
    const ten: MilestoneStats = { firstPositiveDayKey: null, collabDoneCount: 10 };
    expect(evaluateMilestones(ten, '2026-10-15', new Set()).map((d) => d.key)).toEqual([
      'collab_10',
    ]);
    const fifty: MilestoneStats = { firstPositiveDayKey: '2025-10-15', collabDoneCount: 50 };
    expect(evaluateMilestones(fifty, '2026-10-15', new Set()).map((d) => d.key)).toEqual([
      'day_1',
      'day_30',
      'day_100',
      'day_365',
      'collab_10',
      'collab_50',
    ]);
  });

  it('已达成集合中的 key 不重复出（幂等口径）', () => {
    const stats: MilestoneStats = { firstPositiveDayKey: '2026-10-15', collabDoneCount: 50 };
    const due = evaluateMilestones(
      stats,
      '2027-10-15',
      new Set(['day_1', 'day_30', 'day_100', 'day_365', 'collab_10']),
    );
    expect(due.map((d) => d.key)).toEqual(['collab_50']);
  });

  it('每个定义都带纪念剧本 sceneId', () => {
    const stats: MilestoneStats = { firstPositiveDayKey: '2000-01-01', collabDoneCount: 999 };
    for (const def of evaluateMilestones(stats, '2026-10-15', new Set())) {
      expect(def.sceneId).toMatch(/^ev\.milestone\./);
    }
  });
});
