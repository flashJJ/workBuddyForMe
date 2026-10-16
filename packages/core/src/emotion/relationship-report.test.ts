import { describe, expect, it } from 'vitest';
import {
  createDefaultEmotionState,
  type EmotionEventView,
  type RelationshipMilestoneRecord,
} from '@wbfm/shared/schemas';
import { aggregateRelationshipReport, REPORT_SECTION_KEYS } from './relationship-report';
import { renderRelationshipReportHtml } from './relationship-report-html';
import type { RelationshipReportInput, ReportStateRow } from './relationship-report';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

function state(
  assistantId: string,
  name: string,
  relation: { intimacy: number; trust: number },
  opts: { floor?: number; highest?: number; lastPositiveDay?: string | null } = {},
): ReportStateRow {
  const s = createDefaultEmotionState(NOW);
  s.relation = relation;
  if (opts.floor !== undefined) s.relationship.levelFloor = opts.floor;
  s.relationship.highestLevelEver = opts.highest ?? opts.floor ?? 0;
  s.relationship.lastPositiveDay = opts.lastPositiveDay === undefined ? '2026-01-10' : opts.lastPositiveDay;
  return { assistantId, name, state: s };
}

function ev(
  assistantId: string,
  type: EmotionEventView['type'],
  iso: string,
  intensity: number | null = null,
): EmotionEventView {
  return {
    id: `${assistantId}-${type}-${iso}-${Math.random().toString(36).slice(2, 7)}`,
    assistantId,
    type,
    source: type === 'level_up' || type === 'level_down' ? 'system' : 'model',
    emotion: null,
    intensity,
    messageId: null,
    createdAt: iso,
  };
}

function milestone(
  id: string,
  assistantId: string,
  key: string,
  iso: string,
): RelationshipMilestoneRecord {
  return { id, assistantId, milestoneKey: key, achievedAt: iso, payload: {} };
}

function baseInput(): RelationshipReportInput {
  return {
    nowMs: NOW,
    states: [
      state('a1', '小冷', { intimacy: 90, trust: 65 }, { floor: 3, highest: 3 }),
      state('a2', '小暖', { intimacy: 80, trust: 40 }, { floor: 2, highest: 2 }),
      state('a3', '新仔', { intimacy: 5, trust: 0 }),
    ],
    events: [
      ev('a1', 'chat', '2026-01-01T08:00:00.000Z'),
      ev('a1', 'praise', '2026-01-02T08:00:00.000Z'),
      ev('a1', 'comfort', '2026-01-03T08:00:00.000Z'),
      ev('a2', 'chat', '2026-01-10T08:00:00.000Z'),
      // 等级变迁
      ev('a1', 'level_up', '2026-01-01T09:00:00.000Z', 1),
      ev('a1', 'level_up', '2026-01-03T09:00:00.000Z', 2),
      ev('a1', 'level_up', '2026-01-10T09:00:00.000Z', 3),
      ev('a2', 'level_up', '2026-01-09T09:00:00.000Z', 1),
      ev('a2', 'level_up', '2026-01-10T09:30:00.000Z', 2),
      // 降后再升：a1 再次出现 level 2 不应重复计触达
      ev('a1', 'level_down', '2026-01-05T09:00:00.000Z', 2),
      ev('a1', 'level_up', '2026-01-06T09:00:00.000Z', 2),
    ],
    milestones: [
      milestone('m1', 'a1', 'day_1', '2026-01-01T09:00:00.000Z'),
      milestone('m2', 'a1', 'collab_10', '2026-01-08T09:00:00.000Z'),
      milestone('m3', 'a2', 'day_1', '2026-01-09T09:00:00.000Z'),
    ],
    eventUsage: [
      { outcome: 'played', reason: null, playedAt: '2026-01-09T08:00:00.000Z' },
      { outcome: 'played', reason: null, playedAt: '2026-01-10T08:00:00.000Z' },
      { outcome: 'skipped', reason: 'user_skip', playedAt: '2026-01-10T09:00:00.000Z' },
      { outcome: 'suppressed', reason: 'quiet_hours', playedAt: '2026-01-10T23:00:00.000Z' },
      { outcome: 'suppressed', reason: 'cooldown', playedAt: '2026-01-10T10:00:00.000Z' },
    ],
  };
}

describe('aggregateRelationshipReport', () => {
  it('活跃日/连续段：断档后只计最新连续段（等级事件同样计入活跃日）', () => {
    const r = aggregateRelationshipReport(baseInput());
    // 日：01/02/03/05(降级)/06(再升)/09/10
    expect(r.overview.totalActiveDays).toBe(7);
    expect(r.overview.currentStreakDays).toBe(2); // 09→10 连续，06→09 断档
    expect(r.overview.firstActiveDay).toBe('2026-01-01');
  });

  it('等级分布按 displayLevel 分桶（地板/双门槛生效）', () => {
    const r = aggregateRelationshipReport(baseInput());
    expect(r.overview.levelDistribution).toEqual([1, 0, 1, 1]);
    const a1 = r.assistants.find((x) => x.assistantId === 'a1');
    expect(a1?.level).toBe(3);
    expect(a1?.milestonesAchieved).toBe(2);
  });

  it('解锁触达按助手去重；升级间隔取中位数', () => {
    const r = aggregateRelationshipReport(baseInput());
    // a1 曾达 1/2/3，a2 曾达 1/2
    expect(r.overview.unlockReach).toEqual([2, 2, 1]);
    // a1 相邻升级间隔（天）：2、7（降后再升的 level_up 不进 level_up 序列？它也在序列里）
    // 序列为 a1: 01-01 L1, 01-03 L2, 01-06 L2, 01-10 L3 → 间隔 2/3/4；a2: 01-09,01-10 → 1
    const samples = [2, 3, 4, 1].sort((x, y) => x - y);
    const median = (samples[1]! + samples[2]!) / 2;
    expect(r.overview.upgradeMedianDays).toBe(median);
  });

  it('打扰率：放行/抑制计数与原因分布', () => {
    const r = aggregateRelationshipReport(baseInput());
    expect(r.disturbance.total).toBe(5);
    expect(r.disturbance.played).toBe(2);
    expect(r.disturbance.skipped).toBe(1);
    expect(r.disturbance.suppressed).toBe(2);
    expect(r.disturbance.admitted).toBe(3);
    expect(r.disturbance.suppressionRate).toBeCloseTo(0.4);
    const reasons = Object.fromEntries(r.disturbance.suppressByReason.map((x) => [x.reason, x.count]));
    expect(reasons).toEqual({ quiet_hours: 1, cooldown: 1 });
  });

  it('日桶序列按本地日计数且窗口受 seriesDays 约束', () => {
    const r = aggregateRelationshipReport({ ...baseInput(), options: { seriesDays: 7 } });
    expect(r.series).toHaveLength(7);
    expect(r.series[0]?.dayKey).toBe('2026-01-04');
    const last = r.series[r.series.length - 1]!;
    expect(last.dayKey).toBe('2026-01-10');
    expect(last.chat).toBe(1);
    expect(last.levelUp).toBe(2);
    expect(last.total).toBe(3);
  });

  it('排除助手/单条里程碑：数据整体抹除', () => {
    const r = aggregateRelationshipReport({
      ...baseInput(),
      options: { excludeAssistantIds: ['a1'], excludeMilestoneIds: ['m3'] },
    });
    expect(r.assistants.map((a) => a.assistantId).sort()).toEqual(['a2', 'a3']);
    expect(r.milestones).toEqual([]);
    expect(r.overview.unlockReach).toEqual([1, 1, 0]);
    expect(r.overview.levelDistribution).toEqual([1, 0, 1, 0]);
  });

  it('零数据输入返回零值结构不抛错', () => {
    const r = aggregateRelationshipReport({
      nowMs: NOW,
      states: [],
      events: [],
      milestones: [],
      eventUsage: [],
    });
    expect(r.overview.currentStreakDays).toBe(0);
    expect(r.overview.upgradeMedianDays).toBeNull();
    expect(r.disturbance.suppressionRate).toBe(0);
    expect(r.series).toHaveLength(30);
  });
});

describe('renderRelationshipReportHtml', () => {
  it('零网络外链：无 http(s) 引用 / link / script / url()', () => {
    const html = renderRelationshipReportHtml(aggregateRelationshipReport(baseInput()));
    expect(/https?:\/\//.test(html)).toBe(false);
    expect(/<link[\s>]/i.test(html)).toBe(false);
    expect(/<script/i.test(html)).toBe(false);
    expect(/url\(/i.test(html)).toBe(false);
    expect(/src\s*=\s*["']/i.test(html)).toBe(false);
  });

  it('节可选：只渲染勾选的节', () => {
    const data = aggregateRelationshipReport(baseInput());
    const html = renderRelationshipReportHtml(data, { sections: ['overview'] });
    expect(html).toContain('总览');
    expect(html).not.toContain('纪念时刻');
    expect(html).not.toContain('主动打扰');
    expect(html).not.toContain('关系事件趋势');
    // 默认全选
    const full = renderRelationshipReportHtml(data);
    for (const key of REPORT_SECTION_KEYS) {
      expect(full).toContain(
        key === 'overview'
          ? '总览'
          : key === 'assistants'
            ? '陪伴对象'
            : key === 'milestones'
              ? '纪念时刻'
              : key === 'disturbance'
                ? '主动打扰'
                : '关系事件趋势',
      );
    }
  });

  it('英文 locale 输出英文标题，XSS 转义助手名', () => {
    const input = baseInput();
    input.states[0]!.name = '<img src=x onerror=alert(1)>';
    const html = renderRelationshipReportHtml(aggregateRelationshipReport(input), {
      locale: 'en-US',
    });
    expect(html).toContain('Relationship Report');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });

  it('零打扰数据时节内渲染空态而非崩溃', () => {
    const html = renderRelationshipReportHtml(
      aggregateRelationshipReport({
        nowMs: NOW,
        states: [],
        events: [],
        milestones: [],
        eventUsage: [],
      }),
    );
    expect(html).toContain('暂无数据');
  });
});
