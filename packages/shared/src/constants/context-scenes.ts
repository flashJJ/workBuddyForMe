/**
 * v4.9 场景策略：把任务上下文块、步骤历史两处重复的「窗口比例 + 上下限」
 * 收敛为一份预设；对话侧意图配额（ContextPlan）保持独立，不在此合并。
 */

export const CONTEXT_SCENES = [
  'chat_turn',
  'collab_plan',
  'collab_exec',
  'collab_review',
  'task_start',
  'task_step',
  'flow_node',
] as const;
export type ContextScene = (typeof CONTEXT_SCENES)[number];

export const CONTEXT_BUDGET_KINDS = ['contextBlock', 'stepHistory'] as const;
export type ContextBudgetKind = (typeof CONTEXT_BUDGET_KINDS)[number];

export interface ContextBudgetPreset {
  /** 占模型上下文窗口的比例 */
  windowRatio: number;
  /** 小窗口下的绝对下限 */
  minTokens: number;
  /** 大窗口下的绝对上限 */
  maxTokens: number;
}

export const CONTEXT_BUDGET_PRESETS: Record<ContextBudgetKind, ContextBudgetPreset> = {
  contextBlock: { windowRatio: 0.15, minTokens: 320, maxTokens: 2000 },
  stepHistory: { windowRatio: 0.12, minTokens: 320, maxTokens: 1200 },
};

/**
 * 按模型窗口解析场景预算：
 * 未知窗口用上限兜底；已知窗口按比例收敛并钳在上下限之间。
 */
export function resolveClampedBudget(
  contextWindow: number | null | undefined,
  kind: ContextBudgetKind,
): number {
  const preset = CONTEXT_BUDGET_PRESETS[kind];
  if (!contextWindow || contextWindow <= 0) return preset.maxTokens;
  return Math.max(
    preset.minTokens,
    Math.min(preset.maxTokens, Math.floor(contextWindow * preset.windowRatio)),
  );
}
