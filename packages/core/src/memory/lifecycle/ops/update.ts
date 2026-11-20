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

/**
 * 管理页编辑：内容变更时重建 FTS/向量，状态变更写对应审计动作。
 * 未命中返回 null；嵌入失败保留主表更新（降级为纯关键词召回）。
 */
export async function updateMemory(
  { deps, repo }: MemoryUpdateScope,
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
      const vector = embedded.vectors[0]!;
      // 嵌入模型维度变化后旧向量表不可用：保留主表与 FTS，跳过向量写入
      const dimension = getMemoryVectorDimension(deps.db);
      if (dimension === null || dimension === vector.length) {
        ensureMemoryVectorTable(deps.db, vector.length);
        upsertMemoryVector(deps.db, { id: Number(id), vector });
      }
    }
  }
  if (fields.status && fields.status !== existing.status) {
    repo.recordEvent(
      Number(id),
      fields.status === 'archived' ? 'archive' : 'restore',
      existing,
      memory,
      'user',
    );
  } else {
    repo.recordEvent(Number(id), 'update', existing, memory, 'user');
  }
  return memory;
}
