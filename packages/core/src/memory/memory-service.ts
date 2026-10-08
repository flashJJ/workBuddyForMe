import { MEMORY_TOP_K } from '@wbfm/shared/constants';
import { type Memory, type MemoryKind, type MemoryStatus } from '@wbfm/shared/types';
import {
  createMemoryRepository,
  deleteAllMemoryVectors,
  deleteMemoryVector,
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  searchMemoryVectors,
  upsertMemoryVector,
  type DatabaseInstance,
  type MemoryListFilter,
  type MemoryRepository,
} from '@wbfm/database';
import { traceAsync } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import type { ExtractedMemory } from './extractor';
import { runMemoryDecay, type DecayOptions, type DecayResult } from './memory-decay';
import { embedTexts } from './memory-embedding';
import {
  filterRecallHits,
  mergeImportance,
  pickDuplicateTarget,
  toExtractedMemory,
} from './memory-match';
import type {
  ManualMemoryInput,
  RecallOptions,
  RememberOneInput,
  RememberOptions,
  RememberResult,
} from './memory-service-types';

export type {
  ManualMemoryInput,
  RecallOptions,
  RememberOneInput,
  RememberOptions,
  RememberResult,
} from './memory-service-types';

/**
 * v0.5 M3 长期记忆服务：
 * - 自动记忆：回合后提取 → 逐条嵌入 → 相似度去重（≤ 0.35 合并，否则新建）；
 * - 回合前召回：问题嵌入 → topK active 记忆 → 阈值 0.78 过滤 → 刷新访问时间；
 * - 管理 CRUD：M4 设置页复用。
 * 嵌入模型未配置时记忆仍可手工入库，但不参与语义召回。
 */

export function createMemoryService(deps: ServiceDeps) {
  const repo: MemoryRepository = createMemoryRepository(deps.db);

  /** 单条候选落库：向量表存在时查近似记忆，命中则合并更新，否则新建 */
  function persistOne(
    db: DatabaseInstance,
    candidate: ExtractedMemory,
    vector: number[] | null,
    sourceConversationId: string | null,
  ): { memory: Memory; merged: boolean } {
    let nearestId: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    if (vector) {
      ensureMemoryVectorTable(db, vector.length);
      const nearest = pickDuplicateTarget(searchMemoryVectors(db, { vector, k: 1 })[0]);
      if (nearest) {
        nearestId = nearest.id;
        nearestDistance = nearest.distance;
      }
    }

    if (nearestId !== null) {
      const existing = repo.findById(String(nearestId));
      if (existing) {
        const memory = repo.update(String(nearestId), {
          content: candidate.content,
          importance: mergeImportance(existing.importance, candidate.importance),
        })!;
        if (vector) upsertMemoryVector(db, { id: nearestId, vector });
        return { memory, merged: true };
      }
    }

    const memory = repo.add({
      kind: candidate.kind,
      content: candidate.content,
      importance: candidate.importance,
      sourceConversationId,
    });
    if (vector) upsertMemoryVector(db, { id: Number(memory.id), vector });
    // nearestDistance 仅用于调试可读性，避免未使用告警
    void nearestDistance;
    return { memory, merged: false };
  }

  async function rememberCandidates(
    candidates: ExtractedMemory[],
    options: RememberOptions = {},
  ): Promise<RememberResult> {
    if (candidates.length === 0) return { created: 0, updated: 0, memories: [] };
    const embedded = await embedTexts(
      deps,
      candidates.map((c) => c.content),
      options.signal,
    );
    const result: RememberResult = { created: 0, updated: 0, memories: [] };
    const tx = deps.db.transaction((index: number) => {
      const candidate = candidates[index]!;
      const vector = embedded?.vectors[index] ?? null;
      const { memory, merged } = persistOne(
        deps.db,
        candidate,
        vector,
        options.sourceConversationId ?? null,
      );
      result.memories.push(memory);
      if (merged) result.updated += 1;
      else result.created += 1;
    });
    candidates.forEach((_, index) => tx(index));
    return result;
  }

  /** 单条记忆入库（情景记忆/摘要），嵌入去重与自动记忆完全一致 */
  async function rememberOne(input: RememberOneInput, signal?: AbortSignal): Promise<Memory> {
    const candidate = toExtractedMemory(input);
    const embedded = await embedTexts(deps, [candidate.content], signal);
    const vector = embedded?.vectors[0] ?? null;
    const tx = deps.db.transaction(() =>
      persistOne(deps.db, candidate, vector, input.sourceConversationId ?? null),
    );
    return tx().memory;
  }

  async function recall(query: string, options: RecallOptions = {}): Promise<Memory[]> {
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
        if (getMemoryVectorDimension(deps.db) === null) return [];
        const embedded = await embedTexts(deps, [trimmed], options.signal);
        if (!embedded) return [];
        const hits = filterRecallHits(
          searchMemoryVectors(deps.db, { vector: embedded.vectors[0]!, k: MEMORY_TOP_K }),
        );
        const memories = hits
          .map((hit) => repo.findById(String(hit.memoryId)))
          .filter((m): m is Memory => m !== null);
        repo.touchAccessed(memories.map((m) => m.id));
        return memories;
      },
      (memories) => ({ recalled: memories.length }),
    );
  }

  /** M4 管理页：手工新建，同时写入向量（若已配置嵌入模型） */
  async function createManual(input: ManualMemoryInput, signal?: AbortSignal): Promise<Memory> {
    const memory = repo.add({
      kind: input.kind,
      content: input.content,
      importance: input.importance,
      sourceConversationId: null,
    });
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
    if (memory && fields.content && fields.content !== existing.content) {
      const embedded = await embedTexts(deps, [fields.content], signal);
      if (embedded) {
        ensureMemoryVectorTable(deps.db, embedded.dimension);
        upsertMemoryVector(deps.db, { id: Number(id), vector: embedded.vectors[0]! });
      }
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
    const existed = repo.delete(id);
    if (existed && getMemoryVectorDimension(deps.db) !== null) {
      deleteMemoryVector(deps.db, Number(id));
    }
    return existed;
  }

  /** 物理清空记忆库与向量（二次确认由 UI 负责） */
  function clearAll(): number {
    if (getMemoryVectorDimension(deps.db) === null) return repo.deleteAll();
    const tx = deps.db.transaction(() => {
      deleteAllMemoryVectors(deps.db);
      return repo.deleteAll();
    });
    return tx();
  }

  /** P1-1 遗忘策略：间隔保护 + 软归档，具体逻辑在 memory-decay.ts */
  function runDecay(options: DecayOptions = {}): DecayResult {
    return runMemoryDecay(deps.db, repo, options);
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
    list,
    get,
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
