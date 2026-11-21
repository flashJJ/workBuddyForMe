import type { SsePayloadMap } from '@wbfm/shared/api';

/** v4.18：会话预算检查结果（80% 警告 / 100% 拦截） */
export interface BudgetCheck {
  warning?: SsePayloadMap['budget_warning'];
  exceeded?: { code: string; message: string };
}

export interface BudgetReader {
  tokenBudget(id: string): number | null;
  usedTokens(id: string): number;
}

/** 纯读取：不写库、不产生事件；由编排器决定如何提示/拦截 */
export function checkConversationBudget(
  reader: BudgetReader,
  conversationId: string,
): BudgetCheck {
  const limit = reader.tokenBudget(conversationId);
  if (limit === null) return {};
  const used = reader.usedTokens(conversationId);
  const ratio = used / limit;
  if (ratio >= 1) {
    return {
      exceeded: {
        code: 'TOKEN_BUDGET_EXCEEDED',
        message: `会话预算已用尽（${used}/${limit} tokens），请提高预算或新建会话`,
      },
    };
  }
  if (ratio >= 0.8) {
    return { warning: { usedTokens: used, limitTokens: limit, ratio } };
  }
  return {};
}
