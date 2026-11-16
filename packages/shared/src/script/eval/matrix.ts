import { rankCandidates } from '../select';
import type { DecisionWeights } from '../score';
import type { DecisionCandidate, DecisionContext } from '../types';
import type {
  CompanionCandidateSnapshot,
  CompanionEvalContext,
  CompanionMatrixRank,
  CompanionMatrixRow,
  CompanionRankDiff,
} from './types';

/**
 * v4.1 场景矩阵：固定 12 组上下文，跑同一打分器输出排序。
 * 覆盖深夜 / 工作时段 / 晚间，忙碌 / 空闲 / 未知，关系 0/2 与三档心情。
 */
export const DEFAULT_EVAL_CONTEXTS: readonly CompanionEvalContext[] = [
  { id: 'ctx-01', label: '深夜·忙碌·初识·平静', hour: 23, idleMinutes: 5, relationshipLevel: 0, mood: 'normal', work: 'busy' },
  { id: 'ctx-02', label: '深夜·空闲·亲近·低落', hour: 1, idleMinutes: 60, relationshipLevel: 2, mood: 'low', work: 'idle' },
  { id: 'ctx-03', label: '工作时段·忙碌·初识·平静', hour: 14, idleMinutes: 5, relationshipLevel: 0, mood: 'normal', work: 'busy' },
  { id: 'ctx-04', label: '工作时段·空闲·亲近·愉快', hour: 10, idleMinutes: 45, relationshipLevel: 2, mood: 'good', work: 'idle' },
  { id: 'ctx-05', label: '晚间·未知·初识·平静', hour: 20, idleMinutes: 20, relationshipLevel: 0, mood: 'normal', work: 'unknown' },
  { id: 'ctx-06', label: '晚间·空闲·亲近·低落', hour: 21, idleMinutes: 90, relationshipLevel: 2, mood: 'low', work: 'idle' },
  { id: 'ctx-07', label: '深夜·未知·亲近·愉快', hour: 2, idleMinutes: 30, relationshipLevel: 2, mood: 'good', work: 'unknown' },
  { id: 'ctx-08', label: '工作时段·未知·初识·低落', hour: 16, idleMinutes: 15, relationshipLevel: 0, mood: 'low', work: 'unknown' },
  { id: 'ctx-09', label: '晚间·忙碌·亲近·平静', hour: 19, idleMinutes: 5, relationshipLevel: 2, mood: 'normal', work: 'busy' },
  { id: 'ctx-10', label: '深夜·忙碌·亲近·愉快', hour: 0, idleMinutes: 5, relationshipLevel: 2, mood: 'good', work: 'busy' },
  { id: 'ctx-11', label: '工作时段·空闲·初识·低落', hour: 11, idleMinutes: 60, relationshipLevel: 0, mood: 'low', work: 'idle' },
  { id: 'ctx-12', label: '晚间·空闲·初识·愉快', hour: 22, idleMinutes: 45, relationshipLevel: 0, mood: 'good', work: 'idle' },
];

export function toCandidateFromSnapshot(snapshot: CompanionCandidateSnapshot): DecisionCandidate {
  return {
    sceneId: snapshot.sceneId,
    durationMs: snapshot.durationMs,
    beatCount: snapshot.beatCount ?? 0,
    props: snapshot.props ?? [],
    playedToday: snapshot.playedToday ?? false,
    lastPlayedAt: snapshot.lastPlayedAt ?? null,
    theme: snapshot.theme,
    tags: snapshot.tags ?? [],
    preferredMoods: snapshot.preferredMoods,
    preferredHours: snapshot.preferredHours,
  };
}

export function toDecisionContext(context: CompanionEvalContext): DecisionContext {
  return {
    hour: context.hour,
    relationshipLevel: context.relationshipLevel,
    mood: context.mood,
    work: context.work,
    idleMinutes: context.idleMinutes,
    recentProps: context.recentProps ?? [],
    recentThemes: context.recentThemes ?? [],
    usedTags: context.usedTags ?? [],
  };
}

/** 跑矩阵：每个上下文输出全部候选的排序（同分规则由 rankCandidates 保证） */
export function runMatrix(
  contexts: readonly CompanionEvalContext[],
  candidates: readonly CompanionCandidateSnapshot[],
  weights?: DecisionWeights,
): CompanionMatrixRow[] {
  const decisionCandidates = candidates.map(toCandidateFromSnapshot);
  return contexts.map((context) => ({
    contextId: context.id,
    label: context.label,
    ranked: rankCandidates(toDecisionContext(context), decisionCandidates, weights).map(
      (entry): CompanionMatrixRank => ({
        sceneId: entry.candidate.sceneId,
        score: entry.score,
        reasons: entry.reasons,
      }),
    ),
  }));
}

/** 对比两版矩阵：只输出排名变化的场景 */
export function diffMatrix(
  previous: readonly CompanionMatrixRow[],
  next: readonly CompanionMatrixRow[],
): CompanionRankDiff[] {
  const previousRanks = new Map<string, Map<string, number>>();
  for (const row of previous) {
    previousRanks.set(
      row.contextId,
      new Map(row.ranked.map((entry, index) => [entry.sceneId, index + 1])),
    );
  }
  const diffs: CompanionRankDiff[] = [];
  for (const row of next) {
    const before = previousRanks.get(row.contextId);
    row.ranked.forEach((entry, index) => {
      const fromRank = before?.get(entry.sceneId) ?? null;
      const toRank = index + 1;
      if (fromRank !== toRank) {
        diffs.push({ contextId: row.contextId, sceneId: entry.sceneId, fromRank, toRank });
      }
    });
    // 上一版存在、这一版掉出的场景
    for (const [sceneId, fromRank] of before ?? []) {
      if (!row.ranked.some((entry) => entry.sceneId === sceneId)) {
        diffs.push({ contextId: row.contextId, sceneId, fromRank, toRank: null });
      }
    }
  }
  return diffs.sort(
    (a, b) => a.contextId.localeCompare(b.contextId) || a.sceneId.localeCompare(b.sceneId),
  );
}
