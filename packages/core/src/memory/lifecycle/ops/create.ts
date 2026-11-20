import {
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  upsertMemoryFts,
  upsertMemoryVector,
  type MemoryRepository,
} from '@wbfm/database';
import type { Memory } from '@wbfm/shared/types';
import type { ServiceDeps } from '../../../services/base/deps';
import { embedTexts } from '../../memory-embedding';
import type { ManualMemoryInput } from '../../memory-service-types';

export interface MemoryCreateScope {
  deps: ServiceDeps;
  repo: MemoryRepository;
}

/** M4 管理页：手工新建（全局作用域，不参与自动去重合并） */
export async function createManualMemory(
  { deps, repo }: MemoryCreateScope,
  input: ManualMemoryInput,
  signal?: AbortSignal,
): Promise<Memory> {
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
    const vector = embedded.vectors[0]!;
    // 嵌入模型维度变化后旧向量表不可用：保留主表与 FTS，跳过向量写入
    const dimension = getMemoryVectorDimension(deps.db);
    if (dimension === null || dimension === vector.length) {
      ensureMemoryVectorTable(deps.db, vector.length);
      upsertMemoryVector(deps.db, { id: Number(memory.id), vector });
    }
  }
  return memory;
}
