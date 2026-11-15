import type { Memory } from '@wbfm/shared/types';

/**
 * v3.0 M3：把长期记忆里的用户画像（称呼/忌口/作息/共同经历）压成剧本提示词背景块。
 *
 * 生成是后台任务，没有用户 query 可召回，所以按「置顶 → 重要度」取 active 记忆并限长，
 * 避免把整库记忆塞进提示词。纯函数，便于单测与后续调整筛选口径。
 */

export const PROFILE_MAX_MEMORIES = 8;
export const PROFILE_MAX_CHARS = 480;

/** 画像类记忆：硬约束优先展示，事件类不进剧本背景 */
const PROFILE_KINDS: readonly Memory['kind'][] = [
  'constraint',
  'fact',
  'preference',
  'relationship',
];

const KIND_LABELS: Partial<Record<Memory['kind'], string>> = {
  constraint: '约束',
  fact: '事实',
  preference: '偏好',
  relationship: '共同经历',
};

/** 筛选并排序：active + 画像类 + 非空；置顶优先，其次重要度 */
export function selectProfileMemories(memories: readonly Memory[]): Memory[] {
  return memories
    .filter(
      (memory) =>
        memory.status === 'active' &&
        PROFILE_KINDS.includes(memory.kind) &&
        memory.content.trim().length > 0,
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.importance - a.importance)
    .slice(0, PROFILE_MAX_MEMORIES);
}

/** 画像块；没有可用记忆时返回 null（提示词降级为普通用户） */
export function profileContextForPrompt(
  memories: readonly Memory[] | null | undefined,
): string | null {
  const selected = selectProfileMemories(memories ?? []);
  if (selected.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (const memory of selected) {
    const content = memory.content.replace(/\s+/g, ' ').trim();
    const line = `- [${KIND_LABELS[memory.kind] ?? memory.kind}] ${content}`;
    if (used + line.length > PROFILE_MAX_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
