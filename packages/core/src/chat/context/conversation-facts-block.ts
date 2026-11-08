import type { ConversationFact, ConversationFactKind } from '@wbfm/shared/types';
import { truncateToTokens } from './context-budget';

/**
 * v2.26 P1 结构化事实区块：把 conversation_facts 渲染为 system 段。
 * 顺序固定为 事实 → 决策 → 未决问题，与注入顺序契约一致。
 */

const KIND_TITLES: Record<ConversationFactKind, string> = {
  fact: '【对话事实】',
  decision: '【已定决策】',
  open_loop: '【未决问题】',
};

const KIND_ORDER: ConversationFactKind[] = ['fact', 'decision', 'open_loop'];

function renderFact(fact: ConversationFact): string {
  if (fact.kind !== 'fact') return `- ${fact.value}`;
  const unit = fact.unit ? fact.unit : '';
  const value = fact.value.endsWith(unit) || !unit ? fact.value : `${fact.value}${unit}`;
  const since = fact.validFrom ? `（${fact.validFrom} 起）` : '';
  return `- ${value}${since}`;
}

/**
 * 生成事实块；无内容返回 null。
 * @param maxTokens 硬预算（占窗口 10%），超出按 token 截断。
 */
export function buildConversationFactsBlock(
  facts: readonly ConversationFact[],
  maxTokens: number,
): string | null {
  if (facts.length === 0 || maxTokens <= 0) return null;
  const lines: string[] = [];
  for (const kind of KIND_ORDER) {
    const group = facts.filter((fact) => fact.kind === kind);
    if (group.length === 0) continue;
    lines.push(KIND_TITLES[kind], ...group.map(renderFact));
  }
  if (lines.length === 0) return null;
  const block = lines.join('\n');
  const clipped = truncateToTokens(block, maxTokens);
  return clipped.trim() || null;
}
