import {
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  upsertMemoryFts,
  upsertMemoryVector,
  type MemoryRepository,
} from '@wbfm/database';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared/types';
import type { ServiceDeps } from '../../../services/base/deps';
import { embedTexts } from '../../memory-embedding';

export interface MemoryUpdateScope {
  deps: ServiceDeps;
  repo: MemoryRepository;
}

/** v4.21：治理动作——固定、升降权、合并；与原有编辑字段共用一次 PATCH */
export interface MemoryGovernanceFields {
  kind?: MemoryKind;
  content?: string;
  importance?: number;
  status?: MemoryStatus;
  pinned?: boolean;
  weight?: 'up' | 'down';
  mergeIds?: string[];
}

/** v4.21：治理失败（如取消固定硬约束），由 API 映射为 409 */
export class MemoryGovernanceError extends Error {
  constructor(
    public readonly code: 'constraint_pinned',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryGovernanceError';
  }
}

function clampImportance(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

/**
 * 管理页编辑与治理：内容变更时重建 FTS/向量，状态/固定/权重/合并写对应审计动作。
 * 幂等的治理动作（重复固定、权重不变、来源已归档）不写审计。
 */
export async function updateMemory(
  { deps, repo }: MemoryUpdateScope,
  id: string,
  fields: MemoryGovernanceFields,
  signal?: AbortSignal,
): Promise<Memory | null> {
  const existing = repo.findById(id);
  if (!existing) return null;

  if (fields.pinned === false && existing.kind === 'constraint') {
    throw new MemoryGovernanceError('constraint_pinned', '硬约束不支持取消固定，请归档或删除');
  }

  const mergedFrom: string[] = [];
  for (const sourceId of new Set(fields.mergeIds ?? [])) {
    if (sourceId === id) continue;
    const source = repo.findById(sourceId);
    if (!source || source.status === 'archived') continue;
    repo.update(sourceId, { status: 'archived' });
    mergedFrom.push(sourceId);
  }

  const patch: MemoryGovernanceFields = {};
  if (fields.kind && fields.kind !== existing.kind) patch.kind = fields.kind;
  if (fields.content && fields.content !== existing.content) patch.content = fields.content;
  if (fields.status && fields.status !== existing.status) patch.status = fields.status;
  if (fields.pinned !== undefined && fields.pinned !== existing.pinned) patch.pinned = fields.pinned;
  if (fields.importance !== undefined && fields.importance !== existing.importance) {
    patch.importance = fields.importance;
  }
  let weightAction: 'downweight' | 'upweight' | null = null;
  if (fields.weight) {
    const delta = fields.weight === 'up' ? 0.1 : -0.1;
    const next = clampImportance(existing.importance + delta);
    if (next !== existing.importance) {
      patch.importance = next;
      weightAction = fields.weight === 'up' ? 'upweight' : 'downweight';
    }
  }

  if (Object.keys(patch).length === 0 && mergedFrom.length === 0) {
    return existing;
  }

  const memory = repo.update(id, patch);
  if (!memory) return null;
  if (patch.content) {
    upsertMemoryFts(deps.db, { id: Number(id), content: memory.content });
    const embedded = await embedTexts(deps, [patch.content], signal);
    if (embedded) {
      const vector = embedded.vectors[0]!;
      const dimension = getMemoryVectorDimension(deps.db);
      if (dimension === null || dimension === vector.length) {
        ensureMemoryVectorTable(deps.db, vector.length);
        upsertMemoryVector(deps.db, { id: Number(id), vector });
      }
    }
  }

  let action: string | null = null;
  if (mergedFrom.length > 0) action = 'merge';
  else if (patch.status) action = patch.status === 'archived' ? 'archive' : 'restore';
  else if (patch.pinned !== undefined) action = patch.pinned ? 'pin' : 'unpin';
  else if (weightAction) action = weightAction;
  else action = 'update';

  repo.recordEvent(
    Number(id),
    action,
    existing,
    mergedFrom.length > 0 ? { ...memory, mergedFrom } : memory,
    'user',
  );
  return memory;
}
