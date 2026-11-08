import { MEMORY_TOP_K } from '@wbfm/shared/constants';
import {
  type Memory,
  type MemoryKind,
  type MemoryLifecycleStats,
  type MemoryStatus,
} from '@wbfm/shared/types';
import {
  createMemoryRepository,
  deleteAllMemoryFts,
  deleteAllMemoryVectors,
  deleteMemoryFts,
  deleteMemoryVector,
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  upsertMemoryFts,
  upsertMemoryVector,
  type MemoryListFilter,
  type MemoryRepository,
} from '@wbfm/database';
import { traceAsync } from '@wbfm/ai';
import type { ServiceDeps } from '../services/base/deps';
import type { ExtractedMemory } from './extractor';
import { createMemoryPersister, createMemoryRecall } from './lifecycle';
import { createMemoryStats } from './lifecycle/memory-stats';
import {
  runMemoryEventRollup,
  type MemoryEventRollupOptions,
  type MemoryEventRollupResult,
} from './lifecycle/memory-event-rollup';
import { runMemoryDecay, type DecayOptions, type DecayResult } from './memory-decay';
import { embedTexts } from './memory-embedding';
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
  const persister = createMemoryPersister(deps.db, repo);
  const recaller = createMemoryRecall(deps.db, repo);
  const stats = createMemoryStats(deps.db, repo);

  async function rememberCandidates(
    candidates: ExtractedMemory[],
    options: RememberOptions = {},
  ): Promise<RememberResult> {
    if (candidates.length === 0) {
      return { created: 0, updated: 0, superseded: 0, memories: [] };
    }
    const embedded = await embedTexts(
      deps,
      candidates.map((c) => c.content),
      options.signal,
    );
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
        stats.recordRecall(memories.length);
        return memories;
      },
      (memories) => ({ recalled: memories.length }),
    );
  }

  /** M4 管理页：手工新建（全局作用域，不参与自动去重合并） */
  async function createManual(input: ManualMemoryInput, signal?: AbortSignal): Promise<Memory> {
    const memory = repo.add({
      kind: input.kind,
      content: input.content,
      importance: input.importance,
      sourceConversationId: null,
      scope: 'global',
      source: 'manual',
      subjectKey: input.subjectKey ?? null,
    });
    upsertMemoryFts(deps.db, { id: Number(memory.id), content: memory.content });
    repo.recordEvent(Number(memory.id), 'create', null, memory, 'user');
    const embedded = await embedTexts(deps, [input.content], signal);
    if (embedded) {
      ensureMemoryVectorTable(deps.db, embedded.dimension);
      upsertMemoryVector(deps.db, { id: Number(memory.id), vector: embedded.vectors[0]! });
    }
    return memory;
  }

  async function update(
    id: string,
    fields: { kind?: MemoryKind; content?: string; importance?: number; status?: MemoryStatus },
    signal?: AbortSignal,
  ): Promise<Memory | null> {
    const existing = repo.findById(id);
    if (!existing) return null;
    const memory = repo.update(id, fields);
    if (!memory) return null;
    if (fields.content && fields.content !== existing.content) {
      upsertMemoryFts(deps.db, { id: Number(id), content: memory.content });
      const embedded = await embedTexts(deps, [fields.content], signal);
      if (embedded) {
        ensureMemoryVectorTable(deps.db, embedded.dimension);
        upsertMemoryVector(deps.db, { id: Number(id), vector: embedded.vectors[0]! });
      }
    }
    if (fields.status && fields.status !== existing.status) {
      repo.recordEvent(Number(id), fields.status === 'archived' ? 'archive' : 'restore', existing, memory, 'user');
    } else {
      repo.recordEvent(Number(id), 'update', existing, memory, 'user');
    }
    return memory;
  }

  function list(filter: MemoryListFilter = {}): Memory[] {
    return repo.list(filter);
  }

  function get(id: string): Memory | null {
    return repo.findById(id);
  }

  function remove(id: string): boolean {
    const existing = repo.findById(id);
    if (!existing) return false;
    const tx = deps.db.transaction(() => {
      repo.recordEvent(Number(id), 'delete', existing, null, 'user');
      return repo.delete(id);
    });
    const existed = tx();
    if (existed) {
      deleteMemoryFts(deps.db, Number(id));
      if (getMemoryVectorDimension(deps.db) !== null) deleteMemoryVector(deps.db, Number(id));
    }
    return existed;
  }

  /** 物理清空记忆库、向量与全文索引（二次确认由 UI 负责） */
  function clearAll(): number {
    const tx = deps.db.transaction(() => {
      deleteAllMemoryFts(deps.db);
      if (getMemoryVectorDimension(deps.db) !== null) deleteAllMemoryVectors(deps.db);
      return repo.deleteAll();
    });
    return tx();
  }

  /** P2 遗忘策略：decay_score 分档 + TTL 到期软归档，具体逻辑在 memory-decay.ts */
  function runDecay(options: DecayOptions = {}): DecayResult {
    return runMemoryDecay(deps.db, repo, options);
  }

  /** P2 线上计数：零召回率 / superseded 比例 / 用户纠正次数 */
  function getStats(): MemoryLifecycleStats {
    return stats.read();
  }

  /** v2.28 P1：审计事件轮转（保留期外聚合计数并删除原文） */
  function runEventRollup(
    options: MemoryEventRollupOptions = {},
  ): MemoryEventRollupResult {
    return runMemoryEventRollup(deps.db, options);
  }

  return {
    rememberCandidates,
    rememberOne,
    recall,
    createManual,
    update,
    remove,
    clearAll,
    runDecay,
    runEventRollup,
    getStats,
    list,
    get,
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
