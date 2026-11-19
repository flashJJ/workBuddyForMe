import { CONTEXT_BUDGET_SAFETY_RATIO, CONTEXT_PREFLIGHT_TRIGGER_RATIO } from '@wbfm/shared/constants';
import type { ContextPlan, ContextQuotas, TurnIntent, TurnIntentKind } from '@wbfm/shared/schemas';

/**
 * v4.8 上下文策略：意图 → 块配额。
 * 配额是硬上限而不是强制分配；无内容时其他块仍可使用剩余空间。
 * 默认（低置信度回落）保持 v2.26 的 50/35/10 划分。
 */

const DEFAULT_QUOTAS: ContextQuotas = { tail: 0.5, middle: 0.35, memory: 0.1, evidence: 1 };

const INTENT_QUOTAS: Record<TurnIntentKind, ContextQuotas> = {
  chitchat: { tail: 0.6, middle: 0.2, memory: 0.1, evidence: 0.1 },
  knowledge: { tail: 0.35, middle: 0.25, memory: 0.1, evidence: 0.4 },
  follow_up: { tail: 0.6, middle: 0.2, memory: 0.1, evidence: 0.1 },
  tool_task: { tail: 0.4, middle: 0.2, memory: 0.1, evidence: 0.3 },
  clarify: { tail: 0.55, middle: 0.25, memory: 0.1, evidence: 0.1 },
  memory_write: { tail: 0.55, middle: 0.25, memory: 0.1, evidence: 0.1 },
  reminder: { tail: 0.55, middle: 0.25, memory: 0.1, evidence: 0.1 },
};

/** 默认裁剪顺序：先压中段摘要/事实，再压记忆与证据；最近逐字恒最后 */
const CLIP_ORDER = ['middle', 'memory', 'evidence', 'tail'] as const;

export interface BuildContextPlanInput {
  intent: TurnIntent;
  /** 模型上下文窗口；未知时由调用方传兜底预算 */
  contextWindow: number;
  /** 本轮装配前的历史 token 估算（用于预判压缩）；缺省不预判 */
  estimatedHistoryTokens?: number;
}

export function buildContextPlan(input: BuildContextPlanInput): ContextPlan {
  const quotas =
    input.intent.source === 'fallback'
      ? DEFAULT_QUOTAS
      : INTENT_QUOTAS[input.intent.kind];
  const usableWindow = Math.floor(input.contextWindow * CONTEXT_BUDGET_SAFETY_RATIO);
  const preflightCompact =
    input.estimatedHistoryTokens != null &&
    input.estimatedHistoryTokens > usableWindow * CONTEXT_PREFLIGHT_TRIGGER_RATIO;
  return {
    intent: input.intent,
    quotas: { ...quotas },
    clipOrder: [...CLIP_ORDER],
    preflightCompact,
  };
}

/** evidence=1 表示沿用剩余空间，不额外设 RAG 上限（保持旧行为） */
export function hasEvidenceCap(plan: ContextPlan | null | undefined): boolean {
  return plan != null && plan.quotas.evidence < 1;
}

/** 轻量回合阈值：高置信度的寒暄/澄清不需要技能提示词与已发布工作流声明 */
export const LEAN_INTENT_MIN_CONFIDENCE = 0.7;

/**
 * 轻量回合判定：只裁剪「注入型内容」（技能提示词 + 已发布流程工具声明），
 * 不减少检索、记忆召回与助手显式启用的工具——避免误判导致能力缺失。
 */
export function isLeanTurn(intent: TurnIntent): boolean {
  if (intent.confidence < LEAN_INTENT_MIN_CONFIDENCE) return false;
  return intent.kind === 'chitchat' || intent.kind === 'clarify';
}

/** 中段配额拆分：摘要约 71%，结构化事实约 29%（与旧 25/10 同源） */
export function splitMiddleQuota(middle: number): { summary: number; facts: number } {
  return { summary: middle * 0.71, facts: middle * 0.29 };
}
