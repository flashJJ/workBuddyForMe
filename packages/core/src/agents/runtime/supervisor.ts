import { AGENT_BUDGET_DEFAULTS, type AgentBudget, type ReviewVerdict } from '@wbfm/shared/schemas';

/**
 * 协作状态机（纯函数，M1）：固定拓扑 planning→executing→reviewing 的轮次流转。
 * 不接触模型/DB；runner 是唯一驱动方，按模型产出调用 transition。
 *
 * 转移表：
 *   planning  + plan_produced      → executing
 *   executing + execution_finished → reviewing
 *   reviewing + approve            → done（终态）
 *   reviewing + reject             → failed（终态）
 *   reviewing + revise：预算内     → planning（round+1）
 *                      超轮次       → failed（终态 budget_exceeded）
 */

export interface SupervisorState {
  phase: 'planning' | 'executing' | 'reviewing' | 'done' | 'failed';
  /** 0-based 轮次序号（首次=0） */
  round: number;
}

export type SupervisorTerminalReason = 'approved' | 'rejected' | 'budget_exceeded';

export interface SupervisorTransition {
  state: SupervisorState;
  terminal?: SupervisorTerminalReason;
}

export type SupervisorEvent =
  | { type: 'plan_produced' }
  | { type: 'execution_finished' }
  | { type: 'reviewed'; verdict: ReviewVerdict };

export class SupervisorTransitionError extends Error {}

export function createSupervisorState(): SupervisorState {
  return { phase: 'planning', round: 0 };
}

/**
 * 推进一个事件；非法转移抛 SupervisorTransitionError（编程错误，
 * 说明 runner 在错误阶段调用——测试全覆盖防回归）。
 */
export function transition(
  state: SupervisorState,
  event: SupervisorEvent,
  budget: AgentBudget = AGENT_BUDGET_DEFAULTS,
): SupervisorTransition {
  switch (state.phase) {
    case 'planning':
      if (event.type === 'plan_produced') {
        return { state: { ...state, phase: 'executing' } };
      }
      break;
    case 'executing':
      if (event.type === 'execution_finished') {
        return { state: { ...state, phase: 'reviewing' } };
      }
      break;
    case 'reviewing':
      if (event.type === 'reviewed') {
        if (event.verdict === 'approve') {
          return { state: { ...state, phase: 'done' }, terminal: 'approved' };
        }
        if (event.verdict === 'reject') {
          return { state: { ...state, phase: 'failed' }, terminal: 'rejected' };
        }
        // revise：进入下一轮前判定预算（下一轮序号 = round+1，达上限即终止）
        const nextRound = state.round + 1;
        if (nextRound >= budget.maxRounds) {
          return { state: { ...state, phase: 'failed' }, terminal: 'budget_exceeded' };
        }
        return { state: { phase: 'planning', round: nextRound } };
      }
      break;
    case 'done':
    case 'failed':
      throw new SupervisorTransitionError(`协作已终态（${state.phase}），不能再接收事件`);
  }
  throw new SupervisorTransitionError(
    `非法转移：phase=${state.phase} event=${event.type}`,
  );
}

/** 是否已终态（runner 收尾循环的守卫） */
export function isTerminal(state: SupervisorState): boolean {
  return state.phase === 'done' || state.phase === 'failed';
}
