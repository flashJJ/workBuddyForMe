import { MEMORY_DUPLICATE_MAX_DISTANCE } from '@wbfm/shared/constants';
import type { Memory } from '@wbfm/shared/types';
import type { ExtractedMemory } from '../extractor';

/**
 * v2.26 写入决策（纯函数）：
 * 1. 同主体键且内容不同 → supersede（保留旧版本，新行 version+1）；
 * 2. 同主体键且内容相同 → merge（刷新确认时间）；
 * 3. 最近邻向量距离 ≤ 去重阈值 → merge；
 * 4. 其余 → create。
 * LLM 不参与冲突判定，保证可复现、可测试。
 */
export type MemoryWriteAction = 'create' | 'merge' | 'supersede';

export interface MemoryWriteDecision {
  action: MemoryWriteAction;
  targetId: string | null;
}

export interface DecideWriteInput {
  candidate: ExtractedMemory;
  /** 向量最近邻（k=1）；无嵌入/未命中时为 null */
  nearest: { id: string; distance: number } | null;
  /** 同 subjectKey 的 active 记忆（新版本在前） */
  sameSubject: Memory[];
}

export function decideWrite(input: DecideWriteInput): MemoryWriteDecision {
  const content = normalize(input.candidate.content);
  const subjectMatch = input.sameSubject[0] ?? null;

  if (subjectMatch) {
    if (normalize(subjectMatch.content) === content) {
      return { action: 'merge', targetId: subjectMatch.id };
    }
    return { action: 'supersede', targetId: subjectMatch.id };
  }

  if (input.nearest && input.nearest.distance <= MEMORY_DUPLICATE_MAX_DISTANCE) {
    return { action: 'merge', targetId: input.nearest.id };
  }

  return { action: 'create', targetId: null };
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, '').toLowerCase();
}
