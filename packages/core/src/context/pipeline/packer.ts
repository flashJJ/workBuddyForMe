import { estimateTokens, truncateToTokens } from '../../chat/context/context-budget';
import type { ContextFragment, ContextPackOptions, ContextPackResult } from './types';

const DEFAULT_SEPARATOR = '\n\n';

/** 稳定排序 + 按 key 去重：同 key 保留优先级最高（排序后最靠前）的一条 */
function normalize(fragments: readonly ContextFragment[]): ContextFragment[] {
  const sorted = [...fragments].sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const kept: ContextFragment[] = [];
  for (const fragment of sorted) {
    if (seen.has(fragment.key)) continue;
    seen.add(fragment.key);
    kept.push(fragment);
  }
  return kept;
}

/** 拼接片段：第 i 段前的分隔符取第 i-1 段的 separator，缺省用 options.separator */
function joinFragments(fragments: readonly ContextFragment[], fallback: string): string {
  let text = '';
  fragments.forEach((fragment, index) => {
    if (index > 0) text += fragments[index - 1]!.separator ?? fallback;
    text += fragment.text;
  });
  return text;
}

/**
 * 装包：优先级升序拼接 → 按 key 去重 → 超预算从尾部整段丢弃 → 仅剩一段仍超限时截断。
 * 高优先级先保留，低优先级（记忆 / 近期对话）先让位，输出对同一输入稳定。
 */
export function packContext(
  fragments: readonly ContextFragment[],
  options: ContextPackOptions,
): ContextPackResult {
  const separator = options.separator ?? DEFAULT_SEPARATOR;
  const kept = normalize(fragments);
  if (kept.length === 0 || options.budgetTokens <= 0) {
    return { text: null, fragments: 0, dropped: fragments.length, truncated: false };
  }

  let text = joinFragments(kept, separator);
  while (kept.length > 1 && estimateTokens(text) > options.budgetTokens) {
    kept.pop();
    text = joinFragments(kept, separator);
  }

  let truncated = false;
  if (estimateTokens(text) > options.budgetTokens) {
    text = truncateToTokens(text, options.budgetTokens);
    truncated = true;
  }

  return {
    text: text.trim() ? text : null,
    fragments: kept.length,
    dropped: fragments.length - kept.length,
    truncated,
  };
}
