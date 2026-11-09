import {
  MEMORY_CONSOLIDATE_META_KEY,
  MEMORY_CONSOLIDATE_SCAN_LIMIT,
} from '@wbfm/shared/constants';
import type { Memory, MemoryConsolidateSummary } from '@wbfm/shared/types';
import { setMeta, type DatabaseInstance, type MemoryEdgeRepository, type MemoryRepository } from '@wbfm/database';

/**
 * v2.31 P1 空闲整理（零模型成本）：
 * 1. 同义主体归一：同一精确作用域内，subject_key 归一后相同但写法不同的记忆统一到最常见写法；
 * 2. 重复内容归档：正文归一后完全一致时只保留 importance 高、最近确认的一条，其余归档；
 * 3. 悬空边清理：端点不存在或已归档的边直接删除（派生数据）。
 * 只归档不物理删除，全部写 actor='system' 审计；置顶与约束记忆不参与整理。
 */

/** 主体键归一：去空白、全角转半角、大小写与常见标点归一 */
export function normalizeSubjectKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。,.!?！？:：;；"'“”‘’、]/g, '');
}

/** 正文归一：去空白与标点，仅用于判定「完全重复」 */
export function normalizeMemoryContent(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。,.!?！？:：;；"'“”‘’、()（）【】[\]]/g, '');
}

function exactScopeKey(memory: Memory): string {
  return [memory.scope, memory.assistantId ?? '', memory.sourceConversationId ?? ''].join('|');
}

/** 计算需要改写的 subject_key：memoryId → 规范写法 */
export function planSubjectMerge(memories: Memory[]): Map<string, string> {
  const groups = new Map<string, Map<string, Memory[]>>();
  for (const memory of memories) {
    if (!memory.subjectKey || memory.pinned || memory.kind === 'constraint') continue;
    const normalized = normalizeSubjectKey(memory.subjectKey);
    if (!normalized) continue;
    const key = `${exactScopeKey(memory)}|${normalized}`;
    const bucket = groups.get(key) ?? new Map<string, Memory[]>();
    const same = bucket.get(memory.subjectKey) ?? [];
    same.push(memory);
    bucket.set(memory.subjectKey, same);
    groups.set(key, bucket);
  }
  const plan = new Map<string, string>();
  for (const bucket of groups.values()) {
    if (bucket.size <= 1) continue;
    const canonical = [...bucket.entries()].sort(
      (a, b) =>
        b[1].length - a[1].length ||
        (b[1][0]?.updatedAt ?? '').localeCompare(a[1][0]?.updatedAt ?? ''),
    )[0]![0];
    for (const [raw, list] of bucket) {
      if (raw === canonical) continue;
      for (const memory of list) plan.set(memory.id, canonical);
    }
  }
  return plan;
}

/** 计算需要归档的重复记忆 id（每组保留 importance 高、最近确认的一条） */
export function planDuplicateArchive(memories: Memory[]): string[] {
  const groups = new Map<string, Memory[]>();
  for (const memory of memories) {
    if (memory.pinned || memory.kind === 'constraint') continue;
    const normalized = normalizeMemoryContent(memory.content);
    if (!normalized) continue;
    const key = `${exactScopeKey(memory)}|${normalized}`;
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  const archive: string[] = [];
  for (const list of groups.values()) {
    if (list.length <= 1) continue;
    const [keep, ...rest] = [...list].sort(
      (a, b) =>
        b.importance - a.importance ||
        (b.lastConfirmedAt ?? b.updatedAt).localeCompare(a.lastConfirmedAt ?? a.updatedAt),
    );
    for (const memory of rest) {
      if (memory.id !== keep!.id) archive.push(memory.id);
    }
  }
  return archive;
}

export function runMemoryConsolidation(
  db: DatabaseInstance,
  repo: MemoryRepository,
  edgeRepo: MemoryEdgeRepository,
  options: { now?: Date; limit?: number } = {},
): MemoryConsolidateSummary {
  const now = options.now ?? new Date();
  const memories = repo.list({
    status: 'active',
    limit: options.limit ?? MEMORY_CONSOLIDATE_SCAN_LIMIT,
  });

  let mergedSubjects = 0;
  const subjectPlan = planSubjectMerge(memories);
  const tx = db.transaction(() => {
    for (const [memoryId, canonical] of subjectPlan) {
      const before = memories.find((memory) => memory.id === memoryId);
      if (!before) continue;
      repo.update(memoryId, { subjectKey: canonical });
      repo.recordEvent(Number(memoryId), 'update', before, { subjectKey: canonical }, 'system');
    }
    mergedSubjects = new Set(subjectPlan.values()).size;

    let archived = 0;
    for (const memoryId of planDuplicateArchive(memories)) {
      const before = memories.find((memory) => memory.id === memoryId);
      if (!before) continue;
      repo.update(memoryId, { status: 'archived' });
      repo.recordEvent(Number(memoryId), 'archive', before, { status: 'archived' }, 'system');
      archived += 1;
    }
    const summary: MemoryConsolidateSummary = {
      at: now.toISOString(),
      scanned: memories.length,
      archived,
      mergedSubjects,
      edgesRemoved: edgeRepo.deleteDangling(),
    };
    setMeta(db, MEMORY_CONSOLIDATE_META_KEY, JSON.stringify(summary));
    return summary;
  });
  return tx();
}
