import {
  MEMORY_HALF_LIFE_DAYS,
  MEMORY_IMPORTANCE_WEIGHT,
  MEMORY_LEXICAL_WEIGHT,
  MEMORY_PINNED_MIN_SCORE,
  MEMORY_RECENCY_WEIGHT,
  MEMORY_SEMANTIC_WEIGHT,
} from '@wbfm/shared/constants';
import type { Memory, MemoryRecallReason } from '@wbfm/shared/types';
import type { MemoryRecallBudget, MemoryRecallScene } from '../memory-service-types';

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

/**
 * v4.21：召回场景与预算。
 *
 * - chat / task 保持 v4.20 的 3 条上限，token 预算只裁非置顶候选；
 * - intent-forget 只用于定位目标，允许 5 条，最终仍由调用方截断；
 * - token 用字符近似（1 token ≈ 2 字符），不引入 tokenizer。
 */
export const MEMORY_RECALL_SCENES = ['chat', 'task', 'intent-forget'] as const;

export const MEMORY_RECALL_SCENE_PRESETS: Record<MemoryRecallScene, MemoryRecallBudget> = {
  chat: { maxItems: 3, maxTokens: 600 },
  task: { maxItems: 3, maxTokens: 600 },
  'intent-forget': { maxItems: 5, maxTokens: 750 },
};

export function resolveRecallBudget(
  scene: MemoryRecallScene = 'chat',
  override?: Partial<MemoryRecallBudget>,
): MemoryRecallBudget {
  const preset = MEMORY_RECALL_SCENE_PRESETS[scene] ?? MEMORY_RECALL_SCENE_PRESETS.chat;
  return {
    maxItems: Math.max(1, Math.floor(override?.maxItems ?? preset.maxItems)),
    maxTokens: Math.max(0, Math.floor(override?.maxTokens ?? preset.maxTokens)),
  };
}

export function estimateMemoryTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 2);
}

export interface RecallBudgetEntry {
  id: string;
  content: string;
  score: number;
  pinned: boolean;
}

export interface RecallBudgetResult<T> {
  selected: T[];
  droppedByBudget: number;
}

/** v4.21：冲突裁决理由——固定 > 新鲜度 > 置信度 > 稳定顺序 */
export type MemoryConflictReason = 'pinned' | 'fresher' | 'higher-confidence' | 'stable-order';

export interface ConflictCandidate {
  id: string;
  subjectKey: string | null;
  pinned: boolean;
  confidence: number;
  version: number;
  createdAt: string;
  lastConfirmedAt: string | null;
}

export interface MemoryConflictResolution {
  winnerId: string;
  reason: MemoryConflictReason;
  loserIds: string[];
}

export interface ConflictResolveResult<T> {
  kept: T[];
  resolutions: MemoryConflictResolution[];
}

function timeOf(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareIdDesc(a: string, b: string): number {
  return b.localeCompare(a, 'en', { numeric: true });
}

function compareConflict(a: ConflictCandidate, b: ConflictCandidate): number {
  const pinned = Number(b.pinned) - Number(a.pinned);
  if (pinned !== 0) return pinned;
  const fresh = timeOf(b.lastConfirmedAt ?? b.createdAt) - timeOf(a.lastConfirmedAt ?? a.createdAt);
  if (fresh !== 0) return fresh;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (b.version !== a.version) return b.version - a.version;
  return compareIdDesc(a.id, b.id);
}

function conflictReason<T extends ConflictCandidate>(
  winner: T,
  losers: readonly T[],
): MemoryConflictReason {
  if (winner.pinned && losers.some((loser) => !loser.pinned)) return 'pinned';
  const winnerTime = timeOf(winner.lastConfirmedAt ?? winner.createdAt);
  if (winnerTime > Math.max(...losers.map((loser) => timeOf(loser.lastConfirmedAt ?? loser.createdAt)))) {
    return 'fresher';
  }
  if (winner.confidence > Math.max(...losers.map((loser) => loser.confidence))) {
    return 'higher-confidence';
  }
  return 'stable-order';
}

/**
 * v4.21：同主体冲突裁决。
 *
 * 同一 `subjectKey` 只保留 1 条，落选值不删除（调用方可继续查询）；
 * 无 subjectKey 的条目原样通过；返回值保持入参顺序，避免改变召回展示顺序。
 */
export function resolveMemoryConflicts<T extends ConflictCandidate>(
  entries: readonly T[],
): ConflictResolveResult<T> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.subjectKey?.trim();
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const losers = new Set<string>();
  const resolutions: MemoryConflictResolution[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [winner] = [...group].sort(compareConflict);
    const dropped = group.filter((entry) => entry.id !== winner!.id);
    dropped.forEach((entry) => losers.add(entry.id));
    resolutions.push({
      winnerId: winner!.id,
      reason: conflictReason(winner!, dropped),
      loserIds: dropped.map((entry) => entry.id),
    });
  }
  return { kept: entries.filter((entry) => !losers.has(entry.id)), resolutions };
}

function compareId(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/**
 * 按预算选条目：置顶优先且不计 token；其余按分数降序、id 升序补齐，
 * 超出条数或 token 预算的条目被丢弃。入参顺序不参与最终排序，便于复算。
 */
export function applyRecallBudget<T extends RecallBudgetEntry>(
  entries: readonly T[],
  budget: MemoryRecallBudget,
): RecallBudgetResult<T> {
  const pinned = entries.filter((entry) => entry.pinned);
  const rest = entries
    .filter((entry) => !entry.pinned)
    .sort((a, b) => b.score - a.score || compareId(a.id, b.id));
  const selected: T[] = [];
  let tokens = 0;
  let droppedByBudget = 0;

  for (const entry of [...pinned, ...rest]) {
    if (selected.length >= budget.maxItems) {
      droppedByBudget += 1;
      continue;
    }
    if (!entry.pinned) {
      const cost = estimateMemoryTokens(entry.content);
      if (tokens + cost > budget.maxTokens) {
        droppedByBudget += 1;
        continue;
      }
      tokens += cost;
    }
    selected.push(entry);
  }
  return { selected, droppedByBudget };
}
