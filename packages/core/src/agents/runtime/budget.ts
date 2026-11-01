import {
  AGENT_BUDGET_BOUNDS,
  AGENT_BUDGET_DEFAULTS,
  type AgentBudget,
  type AgentBudgetUsage,
} from '@wbfm/shared/schemas';

/**
 * v1.4 三重预算治理（纯函数，无模型/无 DB）：
 * 轮次（规划-执行-审查循环）、单执行步数、总 token。任一触顶即停，
 * runner 据 exceededReason 产出 budget_exceeded 终态。
 */

export interface BudgetState {
  /** 已进入的轮次序号（0-based；首次规划=0，首次返工=1） */
  round: number;
  /** 本轮执行器已用步数（跨轮累计；步数上限语义为「单次协作内总执行步数」） */
  steps: number;
  promptTokens: number;
  completionTokens: number;
}

export type BudgetLimitKind = 'rounds' | 'steps' | 'tokens';

export interface BudgetExceeded {
  kind: BudgetLimitKind;
  used: number;
  limit: number;
}

export function createBudgetState(): BudgetState {
  return { round: 0, steps: 0, promptTokens: 0, completionTokens: 0 };
}

export function toUsage(state: BudgetState): AgentBudgetUsage {
  return {
    round: state.round,
    steps: state.steps,
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    totalTokens: state.promptTokens + state.completionTokens,
  };
}

/** 合并一次模型/执行消耗（负输入按 0 处理，防上游脏数据） */
export function consume(
  state: BudgetState,
  patch: Partial<Pick<BudgetState, 'steps' | 'promptTokens' | 'completionTokens'>>,
): BudgetState {
  return {
    round: state.round,
    steps: state.steps + Math.max(0, Math.trunc(patch.steps ?? 0)),
    promptTokens: state.promptTokens + Math.max(0, Math.trunc(patch.promptTokens ?? 0)),
    completionTokens:
      state.completionTokens + Math.max(0, Math.trunc(patch.completionTokens ?? 0)),
  };
}

/** 进入下一返工轮次（仅轮次号 +1，其余累计） */
export function advanceRound(state: BudgetState): BudgetState {
  return { ...state, round: state.round + 1 };
}

export function totalTokens(state: BudgetState): number {
  return state.promptTokens + state.completionTokens;
}

/** 首个触顶项；未触顶返回 null（检查顺序：轮次→步数→token） */
export function exceededReason(
  state: BudgetState,
  budget: AgentBudget = AGENT_BUDGET_DEFAULTS,
): BudgetExceeded | null {
  // round 为「下一个要进入的轮次」时判定：允许 0..maxRounds-1
  if (state.round >= budget.maxRounds) {
    return { kind: 'rounds', used: state.round, limit: budget.maxRounds };
  }
  if (state.steps >= budget.maxSteps) {
    return { kind: 'steps', used: state.steps, limit: budget.maxSteps };
  }
  const usedTokens = totalTokens(state);
  if (usedTokens >= budget.maxTotalTokens) {
    return { kind: 'tokens', used: usedTokens, limit: budget.maxTotalTokens };
  }
  return null;
}

export function shouldStop(
  state: BudgetState,
  budget: AgentBudget = AGENT_BUDGET_DEFAULTS,
): boolean {
  return exceededReason(state, budget) !== null;
}

/** 预算配置是否落在硬上下界内（供 runner 对外部传入配置做防御性校验） */
export function isBudgetWithinBounds(budget: AgentBudget): boolean {
  return (
    Number.isInteger(budget.maxRounds) &&
    budget.maxRounds >= AGENT_BUDGET_BOUNDS.maxRounds.min &&
    budget.maxRounds <= AGENT_BUDGET_BOUNDS.maxRounds.max &&
    Number.isInteger(budget.maxSteps) &&
    budget.maxSteps >= AGENT_BUDGET_BOUNDS.maxSteps.min &&
    budget.maxSteps <= AGENT_BUDGET_BOUNDS.maxSteps.max &&
    Number.isInteger(budget.maxTotalTokens) &&
    budget.maxTotalTokens >= AGENT_BUDGET_BOUNDS.maxTotalTokens.min &&
    budget.maxTotalTokens <= AGENT_BUDGET_BOUNDS.maxTotalTokens.max
  );
}
