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

/**
 * v4.11：高置信意图 → 主智能体行为提示。
 *
 * v4.8 的意图标签此前只用于上下文配额/轻量回合；这里补上「最后一公里」：
 * 高置信度意图在 system 注入一行行为倾向，让主智能体知道本轮更像任务、问答、
 * 追问还是澄清。只加引导，不删工具、不降检索——误判不会让能力变少。
 */
export const INTENT_HINT_MIN_CONFIDENCE = 0.7;

const INTENT_HINTS: Partial<Record<TurnIntentKind, string>> = {
  tool_task:
    '【本轮倾向】任务执行：优先把请求拆成可执行步骤；需要外部信息或操作时使用已启用的工具，完成后核对结果再回答。',
  knowledge:
    '【本轮倾向】知识问答：若对话中已提供参考资料，优先依据资料回答并说明出处；资料不足时明确说明，不要编造引用。',
  follow_up:
    '【本轮倾向】追问：先对齐上一轮的结论、对象或编号，再补充本轮增量；不要重新开启无关话题。',
  clarify:
    '【本轮倾向】澄清：直接解释上一轮说过或做过什么，必要时引用原话；不要引入新任务。',
};

/** @returns 需要注入的行为提示；fallback / 低置信度 / 寒暄、记忆写入、提醒返回 null。 */
export function buildIntentHintBlock(intent: TurnIntent): string | null {
  if (intent.source === 'fallback' || intent.confidence < INTENT_HINT_MIN_CONFIDENCE) return null;
  return INTENT_HINTS[intent.kind] ?? null;
}
