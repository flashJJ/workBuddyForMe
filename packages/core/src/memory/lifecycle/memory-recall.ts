import type { MemoryRecallBudget, RecalledMemory } from '../memory-service-types';
import {
  MEMORY_HYBRID_CANDIDATES,
  MEMORY_NEIGHBOR_LIMIT,
  MEMORY_NEIGHBOR_SEED_LIMIT,
  MEMORY_PINNED_LIMIT,
  MEMORY_PINNED_MIN_SCORE,
  MEMORY_RECALL_MAX_DISTANCE,
  MEMORY_RECALL_MIN_SCORE,
} from '@wbfm/shared/constants';
import {
  getMemoryVectorDimension,
  searchMemoryFts,
  searchMemoryVectors,
  type DatabaseInstance,
  type MemoryEdgeRepository,
  type MemoryRepository,
  type MemoryScopeFilter,
} from '@wbfm/database';
import { recallScore } from '../memory-match';
import {
  applyRecallBudget,
  fuseMemoryScore,
  normalizeFtsRank,
  recallReason,
  recencyScore,
  resolveMemoryConflicts,
  resolveRecallWeights,
  type MemoryConflictResolution,
} from './memory-retriever';

/** v2.26 召回编排：向量 + FTS 候选 → 融合打分 → 冲突裁决 → 作用域/TTL 过滤 → 置顶补充。 */

export interface RecallCollectResult {
  memories: RecalledMemory[];
  conflicts: MemoryConflictResolution[];
  droppedByBudget: number;
  droppedByScore: number;
  candidates: number;
  channels: {
    semantic: number;
    lexical: number;
    pinned: number;
    neighbor: number;
  };
}

export interface RecallCollectInput {
  query: string;
  /** 查询向量；null=无嵌入模型或嵌入失败（走纯关键词） */
  vector: number[] | null;
  scope: MemoryScopeFilter;
  /** v4.21：场景预算（条数 + token） */
  budget: MemoryRecallBudget;
  now?: Date;
}

export function createMemoryRecall(
  db: DatabaseInstance,
  repo: MemoryRepository,
  edgeRepo: MemoryEdgeRepository,
) {
  function collect(input: RecallCollectInput): RecallCollectResult {
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const semanticScores = new Map<string, number>();
    // 切换嵌入模型后旧向量维度不一致：语义通道降级，不影响关键词召回与本轮对话
    let vector = input.vector;
    if (vector) {
      const dimension = getMemoryVectorDimension(db);
      if (dimension !== null && dimension !== vector.length) vector = null;
    }
    if (vector) {
      for (const hit of searchMemoryVectors(db, {
        vector,
        k: MEMORY_HYBRID_CANDIDATES,
      })) {
        if (hit.distance <= MEMORY_RECALL_MAX_DISTANCE) {
          semanticScores.set(String(hit.memoryId), recallScore(hit.distance));
        }
      }
    }
    const ftsHits = searchMemoryFts(db, {
      query: input.query,
      limit: MEMORY_HYBRID_CANDIDATES,
      scope: input.scope,
      now: nowIso,
    });
    const lexicalScores = new Map<string, number>();
    ftsHits.forEach((hit, index) => {
      lexicalScores.set(String(hit.memoryId), normalizeFtsRank(index, ftsHits.length));
    });

    const ids = [...new Set([...semanticScores.keys(), ...lexicalScores.keys()])];
    const weights = resolveRecallWeights(vector !== null);
    const scoredAll = repo
      .findActiveByIds(ids, input.scope, nowIso)
      .map((memory) => {
        const semantic = semanticScores.get(memory.id) ?? 0;
        const lexical = lexicalScores.get(memory.id) ?? 0;
        const score = fuseMemoryScore(
          {
            semantic,
            lexical,
            importance: memory.importance,
            recency: recencyScore(memory, now),
            pinned: memory.pinned,
          },
          weights,
        );
        return {
          ...memory,
          score,
          reason: recallReason({ semantic, lexical, pinned: memory.pinned }),
        };
      });
    const scored = scoredAll
      .filter((memory) => memory.pinned || memory.score >= MEMORY_RECALL_MIN_SCORE)
      .sort((a, b) => b.score - a.score || b.importance - a.importance);
    const droppedByScore = scoredAll.length - scored.length;

    // v2.31：对最高分种子沿来源边扩一跳；邻居分数 = 种子分 × 边权，总数仍受 MEMORY_TOP_K 约束
    const seeds = scored.slice(0, MEMORY_NEIGHBOR_SEED_LIMIT);
    const neighborScores = new Map<string, { score: number; viaId: string }>();
    for (const neighbor of edgeRepo.listNeighbors(
      seeds.map((memory) => memory.id),
      { assistantId: input.scope.assistantId ?? null, now },
    )) {
      const seed = seeds.find((memory) => memory.id === neighbor.viaId);
      if (!seed) continue;
      const score = seed.score * neighbor.weight;
      if (score < MEMORY_RECALL_MIN_SCORE) continue;
      const existing = neighborScores.get(neighbor.memoryId);
      if (!existing || score > existing.score) {
        neighborScores.set(neighbor.memoryId, { score, viaId: neighbor.viaId });
      }
    }
    const known = new Set(scored.map((memory) => memory.id));
    const neighborIds = [...neighborScores.keys()].filter((id) => !known.has(id));
    const neighbors = repo
      .findActiveByIds(neighborIds, input.scope, nowIso)
      .map((memory) => {
        const hit = neighborScores.get(memory.id)!;
        return {
          ...memory,
          score: hit.score,
          reason: 'neighbor' as const,
          neighborOf: hit.viaId,
        };
      })
      .sort((a, b) => b.score - a.score || b.importance - a.importance)
      .slice(0, MEMORY_NEIGHBOR_LIMIT);
    const candidates = [...scored, ...neighbors].sort(
      (a, b) => b.score - a.score || b.importance - a.importance,
    );

    const pinned = repo.listPinned(input.scope, MEMORY_PINNED_LIMIT, nowIso).map((memory) => ({
      ...memory,
      score: Math.max(
        MEMORY_PINNED_MIN_SCORE,
        fuseMemoryScore(
          {
            semantic: 0,
            lexical: 0,
            importance: memory.importance,
            recency: recencyScore(memory, now),
            pinned: true,
          },
          weights,
        ),
      ),
      reason: 'pinned' as const,
    }));

    const final: RecalledMemory[] = [];
    const seen = new Set<string>();
    for (const memory of [...pinned, ...candidates]) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);
      final.push(memory);
    }
    // v4.21：同主体冲突裁决——只注入胜者，落选值保留在库中
    const { kept, resolutions } = resolveMemoryConflicts(final);
    // v4.21：统一按场景预算裁剪；置顶不计 token，其余按分数补位
    const { selected, droppedByBudget } = applyRecallBudget(kept, input.budget);
    repo.touchAccessed(selected.map((memory) => memory.id));
    const channels = {
      semantic: selected.filter((memory) => memory.reason === 'semantic' || memory.reason === 'hybrid').length,
      lexical: selected.filter((memory) => memory.reason === 'keyword' || memory.reason === 'hybrid').length,
      pinned: selected.filter((memory) => memory.pinned).length,
      neighbor: selected.filter((memory) => memory.reason === 'neighbor').length,
    };
    return {
      memories: selected,
      conflicts: resolutions,
      droppedByBudget,
      droppedByScore,
      candidates: final.length,
      channels,
    };
  }

  return { collect };
}

export type MemoryRecall = ReturnType<typeof createMemoryRecall>;
