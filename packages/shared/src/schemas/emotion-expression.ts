/**
 * v1.6 M3 情绪 → 表情融合（纯函数）。
 *
 * 决策（M0 契约 §6 的实现）：
 * - 本轮显式情绪（signal.emotion !== neutral）采用模型表达，权重取强度地板；
 * - neutral 时读基线 mood：负向情绪优先（anger > sadness），其次正向 joy，
 *   均不达明显阈值则 neutral——弱模型/平静回合由「余韵」而非硬切表情承接；
 * - 表情集合复用现有 8 标签，不引入新词表。
 */
import {
  MOOD_POSITIVE_LEVEL_THRESHOLDS,
  MOOD_NEGATIVE_LEVEL_THRESHOLD,
} from '../constants/emotion';
import type { EmotionState, EmotionSignal } from './emotion';
import { DEFAULT_EXPRESSION, type ExpressionTag } from './expression';

/** 负向基线触发表情的明显阈值（anger/sadness 共用，与分级 evident 档对齐） */
const NEGATIVE_MOOD_EXPRESSION_THRESHOLD = MOOD_POSITIVE_LEVEL_THRESHOLDS.evident;

export interface FusedExpression {
  expression: ExpressionTag;
  /** Live2D 表情设置权重（0..1，已抬到展示地板） */
  weight: number;
}

/** 基线情绪（无本轮显式情绪时）→ 表情；负向优先于正向 */
export function baselineExpression(state: EmotionState): ExpressionTag {
  const { happiness, anger, sadness } = state.mood;
  if (anger >= NEGATIVE_MOOD_EXPRESSION_THRESHOLD) return 'anger';
  if (sadness >= NEGATIVE_MOOD_EXPRESSION_THRESHOLD) return 'sadness';
  if (happiness <= MOOD_NEGATIVE_LEVEL_THRESHOLD) return 'sadness';
  if (happiness >= MOOD_POSITIVE_LEVEL_THRESHOLDS.evident) return 'joy';
  return DEFAULT_EXPRESSION;
}

/**
 * 基线状态 + 本轮信号 → 展示表情与权重。
 * 纯函数、无时间概念（余韵窗口由调用方按时效决定是否调用本函数）。
 */
export function fuseExpression(
  state: EmotionState,
  signal: EmotionSignal,
  minWeight: number,
): FusedExpression {
  if (signal.emotion !== DEFAULT_EXPRESSION) {
    return {
      expression: signal.emotion,
      weight: Math.max(minWeight, Math.min(1, signal.intensity)),
    };
  }
  return { expression: baselineExpression(state), weight: minWeight };
}
