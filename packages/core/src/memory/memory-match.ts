import {
  MEMORY_DUPLICATE_MAX_DISTANCE,
  MEMORY_RECALL_MAX_DISTANCE,
} from '@wbfm/shared/constants';
import type { MemorySearchResult } from '@wbfm/database';
import type { ExtractedMemory } from './extractor';
import type { RememberOneInput } from './memory-service-types';

/** 去重合并目标：k=1 命中且距离 ≤ 合并阈值时返回其 id 与距离，否则返回 null */
export function pickDuplicateTarget(
  hit: MemorySearchResult | undefined,
): { id: number; distance: number } | null {
  if (hit && hit.distance <= MEMORY_DUPLICATE_MAX_DISTANCE) {
    return { id: hit.memoryId, distance: hit.distance };
  }
  return null;
}

/** 召回阈值过滤：丢弃距离超过 MEMORY_RECALL_MAX_DISTANCE 的命中 */
export function filterRecallHits(hits: MemorySearchResult[]): MemorySearchResult[] {
  return hits.filter((hit) => hit.distance <= MEMORY_RECALL_MAX_DISTANCE);
}

/** 合并到已有记忆时，重要性取新旧两者的大值 */
export function mergeImportance(current: number, incoming: number): number {
  return Math.max(current, incoming);
}

/** P1-1 单条情景记忆输入 → 提取候选（内容截断 500 字），复用同一去重/向量管线 */
export function toExtractedMemory(input: RememberOneInput): ExtractedMemory {
  return {
    kind: input.kind,
    content: input.content.slice(0, 500),
    importance: input.importance,
  };
}
