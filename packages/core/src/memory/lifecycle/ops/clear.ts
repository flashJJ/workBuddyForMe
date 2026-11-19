import {
  deleteAllMemoryFts,
  deleteAllMemoryVectors,
  deleteMemoryFts,
  deleteMemoryVector,
  getMemoryVectorDimension,
  type MemoryEdgeRepository,
  type MemoryRepository,
} from '@wbfm/database';
import type { MemoryStatus } from '@wbfm/shared/types';
import type { ServiceDeps } from '../../../services/base/deps';

export interface MemoryClearScope {
  deps: ServiceDeps;
  repo: MemoryRepository;
  edgeRepo: MemoryEdgeRepository;
}

/** 单条删除：主表/审计与关系边同事务，FTS/向量在提交后清理；返回是否命中 */
export function removeMemory({ deps, repo, edgeRepo }: MemoryClearScope, id: string): boolean {
  const existing = repo.findById(id);
  if (!existing) return false;
  const tx = deps.db.transaction(() => {
    edgeRepo.deleteForMemory(id);
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
export function clearAllMemories({ deps, repo, edgeRepo }: MemoryClearScope): number {
  const tx = deps.db.transaction(() => {
    deleteAllMemoryFts(deps.db);
    edgeRepo.deleteAll();
    if (getMemoryVectorDimension(deps.db) !== null) deleteAllMemoryVectors(deps.db);
    return repo.deleteAll();
  });
  return tx();
}

/** v4.12：按状态清理主表、审计与检索索引 */
export function clearMemoriesByStatus(
  { deps, repo, edgeRepo }: MemoryClearScope,
  status: MemoryStatus,
): number {
  const ids = repo.listIdsByStatus(status);
  if (ids.length === 0) return 0;
  const tx = deps.db.transaction(() => {
    for (const id of ids) {
      edgeRepo.deleteForMemory(String(id));
      deleteMemoryFts(deps.db, id);
      if (getMemoryVectorDimension(deps.db) !== null) deleteMemoryVector(deps.db, id);
    }
    repo.deleteEventsByStatus(status);
    return repo.deleteByStatus(status);
  });
  return tx();
}
