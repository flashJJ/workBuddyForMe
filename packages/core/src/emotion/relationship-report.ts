/**
 * v2.0 关系报告聚合器（M5 / G4，见 docs/plan/v2.0/05 §5）。
 *
 * 纯函数 read-model：入参为仓储行数组，出参为报告 JSON；不连 DB、不碰时钟
 * （nowMs 注入）、不发任何网络请求。指标口径全部冻结在本文件：
 * - 连续使用天数：emotion_events 按本地日 distinct，取最新活跃日往回的连续段
 * - 等级分布：displayLevelOf(block, relation) 0/1/2/3 桶
 * - 解锁触达：type=level_up 各等级去重助手计数
 * - 升级耗时：同助手相邻 level_up 间隔（天）的全样本中位数
 * - 打扰率：event_usage admitted(played/skipped/interrupted) vs suppressed + 原因分布
 * - 关系事件量：最近 N 个本地日的日桶序列
 */
import type { EmotionEventView } from '@wbfm/shared/schemas';
import { localDayKey } from '@wbfm/shared/schemas';
import { displayLevelOf } from './relationship-kernel';
import {
  REPORT_DEFAULT_SERIES_DAYS,
  type RelationshipReportData,
  type RelationshipReportInput,
  type ReportAssistantRow,
  type ReportDisturbance,
  type ReportSeriesPoint,
} from './relationship-report-types';

export { REPORT_SECTION_KEYS, REPORT_DEFAULT_SERIES_DAYS } from './relationship-report-types';
export type {
  ReportSectionKey,
  ReportStateRow,
  ReportUsageRow,
  RelationshipReportOptions,
  ReportAssistantRow,
  ReportMilestoneRow,
  ReportDisturbance,
  ReportSeriesPoint,
  RelationshipReportData,
  RelationshipReportInput,
} from './relationship-report-types';

function medianDays(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value * 10) / 10;
}

function dayKeyOfIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? localDayKey(ms) : '';
}

/**
 * 聚合关系报告。剔除项（excludeAssistantIds/excludeMilestoneIds）在入口处过滤，
 * 保证导出的 HTML 不含被删记忆项的任何痕迹。
 */
export function aggregateRelationshipReport(
  input: RelationshipReportInput,
): RelationshipReportData {
  const excludedAssistants = new Set(input.options?.excludeAssistantIds ?? []);
  const excludedMilestones = new Set(input.options?.excludeMilestoneIds ?? []);
  const seriesDays = Math.max(1, Math.min(365, input.options?.seriesDays ?? REPORT_DEFAULT_SERIES_DAYS));

  const states = input.states.filter((s) => !excludedAssistants.has(s.assistantId));
  const events = input.events.filter((e) => !excludedAssistants.has(e.assistantId));
  const milestones = input.milestones.filter(
    (m) => !excludedAssistants.has(m.assistantId) && !excludedMilestones.has(m.id),
  );

  const nameOf = new Map(states.map((s) => [s.assistantId, s.name?.trim() || s.assistantId]));

  // ── 活跃日 / 连续天数 ──
  const activeDays = [...new Set(events.map((e) => dayKeyOfIso(e.createdAt)).filter(Boolean))].sort();
  let currentStreakDays = 0;
  if (activeDays.length > 0) {
    currentStreakDays = 1;
    for (let i = activeDays.length - 1; i > 0; i -= 1) {
      const cur = Date.parse(`${activeDays[i]}T00:00:00Z`);
      const prev = Date.parse(`${activeDays[i - 1]}T00:00:00Z`);
      if (Math.round((cur - prev) / 86_400_000) === 1) currentStreakDays += 1;
      else break;
    }
  }

  // ── 等级分布 / 助手明细 ──
  const levelDistribution: [number, number, number, number] = [0, 0, 0, 0];
  const milestoneCountByAssistant = new Map<string, number>();
  for (const m of milestones) {
    milestoneCountByAssistant.set(m.assistantId, (milestoneCountByAssistant.get(m.assistantId) ?? 0) + 1);
  }
  const assistants: ReportAssistantRow[] = states.map((row) => {
    const level = displayLevelOf(row.state.relationship, row.state.relation);
    levelDistribution[level] = (levelDistribution[level] ?? 0) + 1;
    return {
      assistantId: row.assistantId,
      name: nameOf.get(row.assistantId) ?? row.assistantId,
      level,
      highestLevelEver: row.state.relationship.highestLevelEver,
      intimacy: row.state.relation.intimacy,
      trust: row.state.relation.trust,
      lastPositiveDay: row.state.relationship.lastPositiveDay,
      milestonesAchieved: milestoneCountByAssistant.get(row.assistantId) ?? 0,
    };
  });

  // ── 解锁触达 / 升级耗时（同助手降后再升只计一次） ──
  const upEventsByAssistant = new Map<string, EmotionEventView[]>();
  for (const e of events) {
    if (e.type !== 'level_up' || e.intensity === null) continue;
    const list = upEventsByAssistant.get(e.assistantId) ?? [];
    list.push(e);
    upEventsByAssistant.set(e.assistantId, list);
  }
  const unlockSets: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  const intervals: number[] = [];
  for (const [assistantId, list] of upEventsByAssistant) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < sorted.length; i += 1) {
      const level = sorted[i]?.intensity ?? 0;
      if (level >= 1 && level <= 3) unlockSets[level - 1]!.add(assistantId);
      if (i > 0) {
        const delta =
          (Date.parse(sorted[i]!.createdAt) - Date.parse(sorted[i - 1]!.createdAt)) / 86_400_000;
        if (Number.isFinite(delta)) intervals.push(delta);
      }
    }
  }
  const unlockReach: [number, number, number] = unlockSets.map((s) => s.size) as [
    number,
    number,
    number,
  ];

  // ── 打扰率 ──
  const counts: ReportDisturbance = {
    total: input.eventUsage.length,
    played: 0,
    skipped: 0,
    interrupted: 0,
    suppressed: 0,
    admitted: 0,
    suppressionRate: 0,
    suppressByReason: [],
  };
  const reasonMap = new Map<string, number>();
  for (const u of input.eventUsage) {
    if (u.outcome === 'suppressed') {
      counts.suppressed += 1;
      const reason = u.reason ?? 'unknown';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    } else {
      counts.admitted += 1;
      if (u.outcome === 'played') counts.played += 1;
      if (u.outcome === 'skipped') counts.skipped += 1;
      if (u.outcome === 'interrupted') counts.interrupted += 1;
    }
  }
  counts.suppressionRate = counts.total > 0 ? counts.suppressed / counts.total : 0;
  counts.suppressByReason = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ── 日桶序列（本地日，今天收尾） ──
  const buckets = new Map<string, ReportSeriesPoint>();
  for (let i = seriesDays - 1; i >= 0; i -= 1) {
    const key = localDayKey(input.nowMs - i * 86_400_000);
    buckets.set(key, {
      dayKey: key,
      praise: 0,
      chat: 0,
      belittle: 0,
      comfort: 0,
      levelUp: 0,
      levelDown: 0,
      total: 0,
    });
  }
  for (const e of events) {
    const key = dayKeyOfIso(e.createdAt);
    const point = buckets.get(key);
    if (!point) continue;
    if (e.type === 'praise') point.praise += 1;
    else if (e.type === 'chat') point.chat += 1;
    else if (e.type === 'belittle') point.belittle += 1;
    else if (e.type === 'comfort') point.comfort += 1;
    else if (e.type === 'level_up') point.levelUp += 1;
    else if (e.type === 'level_down') point.levelDown += 1;
    point.total += 1;
  }

  return {
    generatedAt: new Date(input.nowMs).toISOString(),
    seriesDays,
    overview: {
      assistantCount: states.length,
      currentStreakDays,
      totalActiveDays: activeDays.length,
      firstActiveDay: activeDays[0] ?? null,
      levelDistribution,
      unlockReach,
      upgradeMedianDays: medianDays(intervals),
    },
    assistants: assistants.sort((a, b) => b.level - a.level || b.intimacy - a.intimacy),
    milestones: milestones
      .map((m) => ({
        id: m.id,
        assistantId: m.assistantId,
        assistantName: nameOf.get(m.assistantId) ?? m.assistantId,
        key: m.milestoneKey,
        achievedAt: m.achievedAt,
        dayKey: dayKeyOfIso(m.achievedAt),
      }))
      .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)),
    disturbance: counts,
    series: [...buckets.values()],
  };
}
