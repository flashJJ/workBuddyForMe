import { MOOD_POSITIVE_LEVEL_THRESHOLDS } from '../constants/emotion';
import type { EmotionMood } from './emotion';
import type { MotionMood } from './motion-asset';

/**
 * v2.2 M2：待机动作的「状态驱动挑选」纯函数（两渲染后端共用，可完整单测）。
 *
 * 借鉴开源桌宠模拟器 VPet 的 `ModeType` 分组 + `FindGraph` 兼容顺序，映射为：
 * - 候选维度 = 情绪档位（good/normal/low）+ 关系等级门槛（0–3，null = 无门槛）；
 * - 查找顺序 = 精确档位 → 更差档位 → 更好档位 → 任意（仍然要过关系门槛）。
 *
 * 关系等级是**门槛**而非兼容维度：不够就不给（「不熟不做太亲昵的动作」）。
 * 挑不到返回 null，由调用方回落 Default 组（内置动作常驻池，因此实际不会空手）。
 *
 * 候选集由各后端自行提供（VRM 用动作条目、Live2D 用 motion group），本函数只管策略。
 */

/** 档位兼容回退顺序：精确 → 更差 → 更好 */
const MOOD_FALLBACK: Record<MotionMood, readonly MotionMood[]> = {
  good: ['good', 'normal', 'low'],
  normal: ['normal', 'low', 'good'],
  low: ['low', 'normal', 'good'],
};

/** 一个候选（动作条目 / motion group）的状态属性 */
export interface MotionSelectionCandidate {
  mood: MotionMood;
  /** 最低关系等级门槛；null = 无门槛 */
  minRelationshipLevel: number | null;
}

/** 挑选上下文：当前情绪档位 + 当前关系等级 */
export interface MotionSelectionContext {
  mood: MotionMood;
  /** 当前展示关系等级（0 陌生 / 1 认识 / 2 搭档 / 3 挚友） */
  relationshipLevel: number;
}

/** 候选是否满足关系门槛（null = 无门槛） */
export function meetsLevelGate(
  candidate: MotionSelectionCandidate,
  relationshipLevel: number,
): boolean {
  return candidate.minRelationshipLevel === null || relationshipLevel >= candidate.minRelationshipLevel;
}

/** 给定档位的回退顺序（导出供测试与调试对齐口径） */
export function moodFallbackOrder(mood: MotionMood): readonly MotionMood[] {
  return MOOD_FALLBACK[mood] ?? MOOD_FALLBACK.normal;
}

/** 档位判定阈值：与情绪分级共用同一份常数（evident 明显 / slight 微正） */
const MOOD_TIER_POSITIVE = MOOD_POSITIVE_LEVEL_THRESHOLDS.evident;
const MOOD_TIER_NEUTRAL = MOOD_POSITIVE_LEVEL_THRESHOLDS.slight;

/**
 * 情绪状态 → 动作档位（策略层派生，写进契约避免各端各自解释）：
 * - `good`：happiness 明显正向，且 anger/sadness 都不活跃；
 * - `low`：happiness 为负，或 anger/sadness 达到明显阈值；
 * - 其余 → `normal`（缺省档位，也是最终兜底）。
 */
export function motionMoodOf(mood: EmotionMood): MotionMood {
  if (
    mood.happiness >= MOOD_TIER_POSITIVE &&
    mood.anger < MOOD_TIER_NEUTRAL &&
    mood.sadness < MOOD_TIER_NEUTRAL
  ) {
    return 'good';
  }
  if (mood.happiness < 0 || mood.anger >= MOOD_TIER_POSITIVE || mood.sadness >= MOOD_TIER_POSITIVE) {
    return 'low';
  }
  return 'normal';
}

/**
 * 按档位兼容顺序挑第一个「档位命中且满足关系门槛」的候选；全不中返回 null。
 * 纯函数、不修改入参；候选顺序即同档位内的优先顺序。
 */
export function pickMotionCandidate<T extends MotionSelectionCandidate>(
  candidates: readonly T[],
  context: MotionSelectionContext,
): T | null {
  for (const mood of moodFallbackOrder(context.mood)) {
    const hit = candidates.find(
      (candidate) =>
        candidate.mood === mood && meetsLevelGate(candidate, context.relationshipLevel),
    );
    if (hit) return hit;
  }
  // 任意档位里只要过关系门槛即可（Default 兜底语义）
  return candidates.find((candidate) => meetsLevelGate(candidate, context.relationshipLevel)) ?? null;
}
