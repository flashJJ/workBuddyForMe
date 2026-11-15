import {
  RELATIONSHIP_LEVEL_NAMES,
  type PetScriptDecisionReport,
  type PetScriptDecisionWorkState,
  type PetScriptSceneMeta,
  type Scene,
} from '@wbfm/shared/schemas';
import { rankSceneCandidates } from './select';
import type { DecisionContext, RankedCandidate } from './types';

/**
 * M3 Utility 阶段 2：同触发键候选排序。
 *
 * Director 仍负责冷却/门控/打断；这里只决定「先试哪一条」。
 * 同分的候选保留轮换游标，避免上下文的微小差异导致永远只演同一条。
 */

export interface TriggerContextLike {
  hour: number;
  relationshipLevel: string;
  mood: string;
}

export interface TriggerDecisionExtras {
  work: PetScriptDecisionWorkState;
  recentProps: readonly string[];
  recentThemes: readonly string[];
  usedTags: readonly string[];
  recentSceneIds: readonly string[];
  sceneMeta: Record<string, PetScriptSceneMeta>;
}

export interface TriggerOrderResult {
  ordered: RankedCandidate[];
  /** 下一次同触发键的起始游标（只在最高分组内轮换） */
  nextRotation: number;
  context: DecisionContext;
}

function levelIndex(level: string): number {
  const index = RELATIONSHIP_LEVEL_NAMES.indexOf(level as (typeof RELATIONSHIP_LEVEL_NAMES)[number]);
  return index < 0 ? 0 : index;
}

export function orderTriggerCandidates(
  ctx: TriggerContextLike,
  extras: TriggerDecisionExtras,
  scenes: readonly Scene[],
  rotationStart: number,
): TriggerOrderResult {
  const context: DecisionContext = {
    hour: ctx.hour,
    relationshipLevel: levelIndex(ctx.relationshipLevel),
    mood: ctx.mood,
    work: extras.work,
    // 触发是即时事件，空闲时长不参与排序
    idleMinutes: 0,
    recentProps: extras.recentProps,
    recentThemes: extras.recentThemes,
    usedTags: extras.usedTags,
  };
  const ranked = rankSceneCandidates(
    context,
    scenes,
    extras.sceneMeta,
    extras.recentSceneIds,
  );
  if (ranked.length === 0) return { ordered: [], nextRotation: rotationStart, context };

  const topScore = ranked[0]!.score;
  const top = ranked.filter((item) => item.score === topScore);
  const start = top.length > 0 ? rotationStart % top.length : 0;
  const ordered = [
    ...top.slice(start),
    ...top.slice(0, start),
    ...ranked.filter((item) => item.score !== topScore),
  ];
  return {
    ordered,
    nextRotation: top.length > 0 ? (start + 1) % top.length : rotationStart,
    context,
  };
}

/** 决策记录上下文（客户端上报 / 设置页展示共用） */
export function decisionReportContext(
  ctx: DecisionContext,
): PetScriptDecisionReport['context'] {
  return {
    hour: ctx.hour,
    idleMinutes: ctx.idleMinutes,
    level: Math.min(3, Math.max(0, Math.round(ctx.relationshipLevel))),
    mood: ctx.mood.slice(0, 24) || 'normal',
    work: ctx.work,
  };
}
