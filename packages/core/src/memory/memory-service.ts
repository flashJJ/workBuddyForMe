import { MEMORY_TOP_K } from '@wbfm/shared/constants';
import {
  type Memory,
  type MemoryConsolidateSummary,
  type MemoryKind,
  type MemoryLifecycleStats,
  type MemoryStatus,
} from '@wbfm/shared/types';
import {
  createMemoryEdgeRepository,
  createMemoryRepository,
  getMemoryVectorDimension,
  type MemoryListFilter,
  type MemoryRepository,
} from '@wbfm/database';
import { traceAsync } from '@wbfm/ai';
import type { ServiceDeps } from '../services/base/deps';
import type { ExtractedMemory } from './extractor';
import { createMemoryPersister, createMemoryRecall } from './lifecycle';
import {
  clearAllMemories,
  clearMemoriesByStatus,
  createManualMemory,
  readLifecycleStats,
  removeMemory,
  runLifecycleEventRollup,
  updateMemory,
} from './lifecycle/ops';
import type {
  MemoryEventRollupOptions,
  MemoryEventRollupResult,
} from './lifecycle/memory-event-rollup';
import { runMemoryConsolidation } from './graph';
import { createMemoryStats } from './lifecycle/memory-stats';
import { runMemoryDecay, type DecayOptions, type DecayResult } from './memory-decay';
import { embedTexts } from './memory-embedding';
import { buildSameSourceEdges } from './graph';
import { toExtractedMemory } from './memory-match';
import type {
  ManualMemoryInput,
  RecalledMemory,
  RecallOptions,
  RememberOneInput,
  RememberOptions,
  RememberResult,
} from './memory-service-types';

export type {
  ManualMemoryInput,
  RecalledMemory,
  RecallOptions,
  RememberOneInput,
  RememberOptions,
  RememberResult,
} from './memory-service-types';

/**
 * v0.5 M3 长期记忆服务（v2.26 升级）：
 * - 写入：向量最近邻 + 同主体键 → create/merge/supersede，审计与主写入同事务；
 * - 召回：向量 + FTS 混合打分，作用域过滤，置顶硬约束固定注入；
 * - 管理 CRUD：M4 设置页复用。
 * 嵌入模型未配置时仍可写入，召回退化为纯关键词。
 */

export function createMemoryService(deps: ServiceDeps) {
  const repo: MemoryRepository = createMemoryRepository(deps.db);
  const edgeRepo = createMemoryEdgeRepository(deps.db);
  const persister = createMemoryPersister(deps.db, repo);
  const recaller = createMemoryRecall(deps.db, repo, edgeRepo);
  const stats = createMemoryStats(deps.db, repo);

  async function rememberCandidates(
    candidates: ExtractedMemory[],
    options: RememberOptions = {},
  ): Promise<RememberResult> {
    if (candidates.length === 0) {
      return { created: 0, updated: 0, superseded: 0, memories: [] };
    }
    const embedded = options.skipEmbedding
      ? null
      : await embedTexts(deps, candidates.map((c) => c.content), options.signal);
    const ctx = {
      scope: options.scope ?? 'global',
      assistantId: options.assistantId ?? null,
      sourceConversationId: options.sourceConversationId ?? null,
      sourceMessageId: options.sourceMessageId ?? null,
      source: options.source ?? 'extract',
      ttlAt: options.ttlAt ?? null,
    } as const;
    const result: RememberResult = { created: 0, updated: 0, superseded: 0, memories: [] };
    const tx = deps.db.transaction((index: number) => {
      const candidate = candidates[index]!;
      const vector = embedded?.vectors[index] ?? null;
      const outcome = persister.persist(candidate, vector, ctx);
      result.memories.push(outcome.memory);
      if (outcome.action === 'create') result.created += 1;
      else if (outcome.action === 'merge') result.updated += 1;
      else result.superseded += 1;
    });
    candidates.forEach((_, index) => tx(index));
    // 关系边是派生数据：写入失败只告警，不影响记忆落库与回合完成
    try {
      edgeRepo.link(buildSameSourceEdges(result.memories, ctx.sourceMessageId));
    } catch (error) {
      console.warn('[memory] 关系边写入失败', error);
    }
    return result;
  }

  /** 单条记忆入库（情景记忆/摘要/实时约束），复用同一写入决策管线 */
  async function rememberOne(input: RememberOneInput, signal?: AbortSignal): Promise<Memory> {
    const candidate: ExtractedMemory = {
      ...toExtractedMemory(input),
      subjectKey: input.subjectKey ?? null,
      pinned: input.pinned,
    };
    const embedded = await embedTexts(deps, [candidate.content], signal);
    const vector = embedded?.vectors[0] ?? null;
    const tx = deps.db.transaction(() =>
      persister.persist(candidate, vector, {
        scope: input.scope ?? 'global',
        assistantId: input.assistantId ?? null,
        sourceConversationId: input.sourceConversationId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        source: input.source ?? 'summary',
        ttlAt: input.ttlAt ?? null,
      }),
    );
    return tx().memory;
  }

  async function recall(query: string, options: RecallOptions = {}): Promise<RecalledMemory[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return traceAsync(
      {
        name: 'memory_recall',
        runType: 'retriever',
        parent: options.traceParent ?? null,
        inputs: { queryLength: trimmed.length, topK: MEMORY_TOP_K },
      },
      async () => {
        let vector: number[] | null = null;
        if (getMemoryVectorDimension(deps.db) !== null) {
          const embedded = await embedTexts(deps, [trimmed], options.signal);
          vector = embedded?.vectors[0] ?? null;
        }
        const memories = recaller.collect({
          query: trimmed,
          vector,
          scope: {
            assistantId: options.assistantId ?? null,
            conversationId: options.conversationId ?? null,
          },
        });
        stats.recordRecall(
          memories.length,
          memories.filter((memory) => memory.reason === 'neighbor').length,
        );
        return memories;
      },
      (memories) => ({ recalled: memories.length }),
    );
  }

  /** M4 管理页：手工新建（全局作用域，不参与自动去重合并） */
  const createManual = (input: ManualMemoryInput, signal?: AbortSignal): Promise<Memory> =>
    createManualMemory({ deps, repo }, input, signal);

  const update = (
    id: string,
    fields: { kind?: MemoryKind; content?: string; importance?: number; status?: MemoryStatus },
    signal?: AbortSignal,
  ): Promise<Memory | null> => updateMemory({ deps, repo }, id, fields, signal);

  const list = (filter: MemoryListFilter = {}): Memory[] => repo.list(filter);
  const get = (id: string): Memory | null => repo.findById(id);

  function remove(id: string): boolean {
    return removeMemory({ deps, repo, edgeRepo }, id);
  }

  /** 物理清空记忆库、向量与全文索引（二次确认由 UI 负责） */
  function clearAll(): number {
    return clearAllMemories({ deps, repo, edgeRepo });
  }
  function clearByStatus(status: MemoryStatus): number {
    return clearMemoriesByStatus({ deps, repo, edgeRepo }, status);
  }

  /** P2 遗忘策略：decay_score 分档 + TTL 到期软归档，具体逻辑在 memory-decay.ts */
  const runDecay = (options: DecayOptions = {}): DecayResult =>
    runMemoryDecay(deps.db, repo, options);

  /** P2 线上计数：零召回率 / superseded 比例 / 用户纠正次数 */
  const getStats = (): MemoryLifecycleStats => readLifecycleStats(stats);

  /** v2.28 P1：审计事件轮转（保留期外聚合计数并删除原文） */
  function runEventRollup(options: MemoryEventRollupOptions = {}): MemoryEventRollupResult {
    return runLifecycleEventRollup(deps, options);
  }

  /** v2.31 P1：空闲整理（同义主体归一、重复内容归档、悬空边清理） */
  const consolidate = (options: { now?: Date; limit?: number } = {}): MemoryConsolidateSummary =>
    runMemoryConsolidation(deps.db, repo, edgeRepo, options);

  return {
    rememberCandidates,
    rememberOne,
    recall,
    createManual,
    update,
    remove,
    clearAll,
    clearByStatus,
    runDecay,
    runEventRollup,
    consolidate,
    getStats,
    list,
    get,
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
