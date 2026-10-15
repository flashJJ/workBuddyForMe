/**
 * v2.0 M2 共同里程碑纯函数（不碰 DB/时钟；见 docs/plan/v2.0/05 §2.1）。
 *
 * 里程碑定义在代码（RELATIONSHIP_MILESTONES），评估只依据只读统计：
 * - day_*：距最早正向互动（emotion_events 的 praise/chat/comfort）的自然日数；
 *   首次互动当日算第 1 天，dayDiff ≥ N-1 达成；
 * - collab_*：该助手 agent_runs status=done 的累计条数。
 * 已达成集合由调用方从 relationship_milestones 表读出，本函数只出「本次新达成」，
 * 顺序与定义数组一致（保证多档同日达成时纪念剧本按 day1→30→…→collab50 序补演）。
 */
import {
  RELATIONSHIP_MILESTONES,
  type RelationshipMilestoneDef,
} from '@wbfm/shared/constants';

export interface MilestoneStats {
  /** 最早正向互动的本地日期键 YYYY-MM-DD（由 ISO 经 localDayKey 换算）；从未互动 null */
  firstPositiveDayKey: string | null;
  /** done 协作运行累计数 */
  collabDoneCount: number;
}

/** 两个 YYYY-MM-DD 日期键的整天差（to ≥ from；非法输入返回 0） */
export function dayKeyBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * 评估本次新达成的里程碑（已达成的不重复出）。
 * 纯函数无副作用：写表与触发剧本由 service 层消费返回值。
 */
export function evaluateMilestones(
  stats: MilestoneStats,
  todayDayKey: string,
  achievedKeys: ReadonlySet<string>,
): RelationshipMilestoneDef[] {
  const dayDiff =
    stats.firstPositiveDayKey === null
      ? null
      : dayKeyBetween(stats.firstPositiveDayKey, todayDayKey);
  const due: RelationshipMilestoneDef[] = [];
  for (const def of RELATIONSHIP_MILESTONES) {
    if (achievedKeys.has(def.key)) continue;
    if (def.kind === 'day') {
      // 首次互动当日=第 1 天（dayDiff ≥ N-1）；无正向互动永不达成
      if (dayDiff !== null && dayDiff >= (def.day ?? 1) - 1) due.push(def);
    } else if (def.kind === 'collab') {
      if (stats.collabDoneCount >= (def.collab ?? Number.POSITIVE_INFINITY)) due.push(def);
    }
  }
  return due;
}
