import type { Memory, MemoryScope, MemorySource } from '@wbfm/shared/types';
import {
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  nowIso,
  searchMemoryVectors,
  upsertMemoryFts,
  upsertMemoryVector,
  type DatabaseInstance,
  type MemoryAddFields,
  type MemoryRepository,
} from '@wbfm/database';
import type { ExtractedMemory } from '../extractor';
import { pickDuplicateTarget } from '../memory-match';
import { decideWrite, type MemoryWriteAction } from './memory-write';

/** v2.26 记忆写库编排：向量最近邻 + 同主体键 → 决策 → create/merge/supersede + 审计。 */

export interface PersistContext {
  scope: MemoryScope;
  assistantId: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  source: MemorySource;
  /** v2.26：临时事件 TTL（null=永久） */
  ttlAt?: string | null;
}

export interface PersistResult {
  memory: Memory;
  action: MemoryWriteAction;
  replacedPrevious: Memory | null;
}

export function createMemoryPersister(db: DatabaseInstance, repo: MemoryRepository) {
  function persist(
    candidate: ExtractedMemory,
    vector: number[] | null,
    ctx: PersistContext,
    actor = 'system',
  ): PersistResult {
    const exactScope = {
      scope: ctx.scope,
      assistantId: ctx.assistantId,
      conversationId: ctx.sourceConversationId,
    };
    // 嵌入模型维度变化后旧向量表不可用：本条记忆降级为只写 FTS，避免整条写入失败
    let effectiveVector = vector;
    if (effectiveVector) {
      const dimension = getMemoryVectorDimension(db);
      if (dimension !== null && dimension !== effectiveVector.length) effectiveVector = null;
    }
    let nearest: { id: string; distance: number } | null = null;
    if (effectiveVector) {
      ensureMemoryVectorTable(db, effectiveVector.length);
      const hit = pickDuplicateTarget(searchMemoryVectors(db, { vector: effectiveVector, k: 1 })[0]);
      if (hit) nearest = { id: String(hit.id), distance: hit.distance };
    }
    const sameSubject = candidate.subjectKey
      ? repo.findActiveBySubject(candidate.subjectKey, exactScope)
      : [];
    const decision = decideWrite({ candidate, nearest, sameSubject });

    const fields: MemoryAddFields = {
      kind: candidate.kind,
      content: candidate.content.slice(0, 500),
      importance: candidate.importance,
      sourceConversationId: ctx.sourceConversationId,
      sourceMessageId: ctx.sourceMessageId,
      scope: ctx.scope,
      assistantId: ctx.assistantId,
      source: candidate.kind === 'constraint' ? 'realtime' : ctx.source,
      pinned: candidate.pinned ?? false,
      confidence: candidate.confidence ?? 1,
      subjectKey: candidate.subjectKey ?? null,
      ttlAt: ctx.ttlAt ?? null,
    };

    if (decision.action === 'merge' && decision.targetId) {
      const existing = repo.findById(decision.targetId);
      if (existing) return merge(existing, fields, effectiveVector, actor);
    }
    if (decision.action === 'supersede' && decision.targetId) {
      const previous = repo.findById(decision.targetId);
      if (previous) return supersede(previous, fields, effectiveVector, actor);
    }
    return create(fields, effectiveVector, actor);
  }

  function create(fields: MemoryAddFields, vector: number[] | null, actor: string): PersistResult {
    const memory = repo.add(fields);
    upsertMemoryFts(db, { id: Number(memory.id), content: memory.content });
    if (vector) upsertMemoryVector(db, { id: Number(memory.id), vector });
    repo.recordEvent(Number(memory.id), 'create', null, memory, actor);
    return { memory, action: 'create', replacedPrevious: null };
  }

  function merge(
    existing: Memory,
    fields: MemoryAddFields,
    vector: number[] | null,
    actor: string,
  ): PersistResult {
    const useCandidate = fields.content.length >= existing.content.length;
    const content = useCandidate ? fields.content : existing.content;
    const memory = repo.update(existing.id, {
      content,
      importance: Math.max(existing.importance, fields.importance),
      confidence: Math.max(existing.confidence, fields.confidence ?? 1),
      pinned: existing.pinned || fields.pinned === true,
      subjectKey: existing.subjectKey ?? fields.subjectKey ?? null,
      lastConfirmedAt: nowIso(),
    })!;
    upsertMemoryFts(db, { id: Number(memory.id), content: memory.content });
    if (vector && useCandidate) upsertMemoryVector(db, { id: Number(memory.id), vector });
    repo.recordEvent(Number(memory.id), 'merge', existing, memory, actor);
    return { memory, action: 'merge', replacedPrevious: null };
  }

  function supersede(
    previous: Memory,
    fields: MemoryAddFields,
    vector: number[] | null,
    actor: string,
  ): PersistResult {
    const result = repo.supersede(
      previous.id,
      {
        ...fields,
        pinned: fields.pinned === true || previous.pinned,
        subjectKey: previous.subjectKey ?? fields.subjectKey ?? null,
      },
      actor,
    );
    if (!result) return create(fields, vector, actor);
    upsertMemoryFts(db, { id: Number(result.next.id), content: result.next.content });
    if (vector) upsertMemoryVector(db, { id: Number(result.next.id), vector });
    return { memory: result.next, action: 'supersede', replacedPrevious: result.previous };
  }

  return { persist };
}

export type MemoryPersister = ReturnType<typeof createMemoryPersister>;
