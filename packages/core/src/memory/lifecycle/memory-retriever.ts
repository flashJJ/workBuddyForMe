import {
  MEMORY_HALF_LIFE_DAYS,
  MEMORY_IMPORTANCE_WEIGHT,
  MEMORY_LEXICAL_WEIGHT,
  MEMORY_PINNED_MIN_SCORE,
  MEMORY_RECENCY_WEIGHT,
  MEMORY_SEMANTIC_WEIGHT,
} from '@wbfm/shared/constants';
import type { Memory, MemoryRecallReason } from '@wbfm/shared/types';

/**
 * v2.26 混合召回打分（纯函数，便于单测）：
 * score = 0.55*sem + 0.20*lex + 0.15*importance + 0.10*recency；
 * 无嵌入模型时把语义权重并入关键词（0.75/0.15/0.10），避免关键词通道永远无法过线；
 * pinned/constraint 的 recency 固定为 1，且分数下限提到 MEMORY_PINNED_MIN_SCORE。
 */

export interface RecallWeights {
  semantic: number;
  lexical: number;
  importance: number;
  recency: number;
}

export interface ScoredMemoryInput {
  semantic: number;
  lexical: number;
  importance: number;
  recency: number;
  pinned: boolean;
}

export function resolveRecallWeights(hasEmbedding: boolean): RecallWeights {
  if (hasEmbedding) {
    return {
      semantic: MEMORY_SEMANTIC_WEIGHT,
      lexical: MEMORY_LEXICAL_WEIGHT,
      importance: MEMORY_IMPORTANCE_WEIGHT,
      recency: MEMORY_RECENCY_WEIGHT,
    };
  }
  return {
    semantic: 0,
    lexical: MEMORY_SEMANTIC_WEIGHT + MEMORY_LEXICAL_WEIGHT,
    importance: MEMORY_IMPORTANCE_WEIGHT,
    recency: MEMORY_RECENCY_WEIGHT,
  };
}

/** FTS 排名归一化：首条 1，末条 0；只有一条命中视为完全命中 */
export function normalizeFtsRank(index: number, total: number): number {
  if (total <= 1) return 1;
  return Math.max(0, 1 - index / (total - 1));
}

/** 新鲜度：按类别半衰期指数衰减；置顶/硬约束不衰减 */
export function recencyScore(memory: Memory, now: Date = new Date()): number {
  if (memory.pinned || memory.kind === 'constraint') return 1;
  const base = memory.lastConfirmedAt ?? memory.createdAt;
  const time = Date.parse(base);
  if (Number.isNaN(time)) return 1;
  const ageDays = Math.max(0, (now.getTime() - time) / (24 * 60 * 60 * 1000));
  const halfLife = MEMORY_HALF_LIFE_DAYS[memory.kind] ?? 180;
  return Math.exp(-ageDays / halfLife);
}

export function fuseMemoryScore(input: ScoredMemoryInput, weights: RecallWeights): number {
  const raw =
    weights.semantic * clamp01(input.semantic) +
    weights.lexical * clamp01(input.lexical) +
    weights.importance * clamp01(input.importance) +
    weights.recency * clamp01(input.recency);
  const score = input.pinned ? Math.max(raw, MEMORY_PINNED_MIN_SCORE) : raw;
  return Math.round(clamp01(score) * 1000) / 1000;
}

/** 召回理由：pinned > hybrid > semantic > keyword */
export function recallReason(input: {
  semantic: number;
  lexical: number;
  pinned: boolean;
}): MemoryRecallReason {
  if (input.pinned) return 'pinned';
  if (input.semantic > 0 && input.lexical > 0) return 'hybrid';
  if (input.semantic > 0) return 'semantic';
  return 'keyword';
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
