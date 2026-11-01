import { AGENT_BUDGET_DEFAULTS, type AgentBudget } from '@wbfm/shared/schemas';
import { describe, expect, it } from 'vitest';
import {
  SupervisorTransitionError,
  createSupervisorState,
  isTerminal,
  transition,
} from './supervisor';

/** 推进一个完整轮次到 reviewed 前（planning→executing→reviewing） */
function advanceToReviewing(round: number): ReturnType<typeof createSupervisorState> {
  let s: ReturnType<typeof createSupervisorState> = { phase: 'reviewing', round };
  // 直接构造 reviewing 态用于裁决测试
  s = { phase: 'reviewing', round };
  return s;
}

describe('agents/supervisor 正常路径转移', () => {
  it('首轮 planning→executing→reviewing→approve→done', () => {
    let s = createSupervisorState();
    expect(s).toEqual({ phase: 'planning', round: 0 });

    s = transition(s, { type: 'plan_produced' }).state;
    expect(s.phase).toBe('executing');

    s = transition(s, { type: 'execution_finished' }).state;
    expect(s.phase).toBe('reviewing');

    const approved = transition(s, { type: 'reviewed', verdict: 'approve' });
    expect(approved.state.phase).toBe('done');
    expect(approved.terminal).toBe('approved');
    expect(isTerminal(approved.state)).toBe(true);
  });

  it('revise 预算内回 planning 且轮次 +1', () => {
    const s = advanceToReviewing(0);
    const t = transition(s, { type: 'reviewed', verdict: 'revise' });
    expect(t.state).toEqual({ phase: 'planning', round: 1 });
    expect(t.terminal).toBeUndefined();
    expect(isTerminal(t.state)).toBe(false);
  });

  it('第二轮 approve 终态轮次号保留', () => {
    const t = transition(advanceToReviewing(1), { type: 'reviewed', verdict: 'approve' });
    expect(t.state).toEqual({ phase: 'done', round: 1 });
  });

  it('reject → failed/rejected', () => {
    const t = transition(advanceToReviewing(0), { type: 'reviewed', verdict: 'reject' });
    expect(t.state.phase).toBe('failed');
    expect(t.terminal).toBe('rejected');
  });
});

describe('agents/supervisor 轮次预算', () => {
  it('默认 3 轮：第 0、1 轮 revise 可返工，第 2 轮 revise 超预算终态', () => {
    const t1 = transition(advanceToReviewing(0), { type: 'reviewed', verdict: 'revise' });
    expect(t1.state.phase).toBe('planning');
    const t2 = transition(advanceToReviewing(1), { type: 'reviewed', verdict: 'revise' });
    expect(t2.state.phase).toBe('planning');
    const t3 = transition(advanceToReviewing(2), { type: 'reviewed', verdict: 'revise' });
    expect(t3.state.phase).toBe('failed');
    expect(t3.terminal).toBe('budget_exceeded');
  });

  it('maxRounds=1：首轮 revise 即超预算', () => {
    const budget: AgentBudget = { ...AGENT_BUDGET_DEFAULTS, maxRounds: 1 };
    const t = transition(advanceToReviewing(0), { type: 'reviewed', verdict: 'revise' }, budget);
    expect(t.terminal).toBe('budget_exceeded');
    expect(t.state.round).toBe(0);
  });

  it('maxRounds=1：首轮 approve 不受影响', () => {
    const budget: AgentBudget = { ...AGENT_BUDGET_DEFAULTS, maxRounds: 1 };
    const t = transition(advanceToReviewing(0), { type: 'reviewed', verdict: 'approve' }, budget);
    expect(t.terminal).toBe('approved');
  });
});

describe('agents/supervisor 非法转移防护', () => {
  it.each([
    ['planning 收到审查结果', { phase: 'planning', round: 0 }, { type: 'reviewed', verdict: 'approve' }],
    ['planning 收到执行完成', { phase: 'planning', round: 0 }, { type: 'execution_finished' }],
    ['executing 收到派单', { phase: 'executing', round: 0 }, { type: 'plan_produced' }],
    ['executing 收到审查', { phase: 'executing', round: 0 }, { type: 'reviewed', verdict: 'reject' }],
    ['reviewing 收到派单', { phase: 'reviewing', round: 0 }, { type: 'plan_produced' }],
    ['reviewing 收到执行完成', { phase: 'reviewing', round: 0 }, { type: 'execution_finished' }],
  ] as const)('%s 抛错', (_name, phase, event) => {
    expect(() => transition(phase, event)).toThrow(SupervisorTransitionError);
  });

  it('终态后再收事件抛错', () => {
    expect(() =>
      transition({ phase: 'done', round: 1 }, { type: 'reviewed', verdict: 'approve' }),
    ).toThrow(/终态/);
    expect(() =>
      transition({ phase: 'failed', round: 0 }, { type: 'plan_produced' }),
    ).toThrow(/终态/);
  });

  it('多轮完整循环：两轮 revise 后第三轮 approve', () => {
    let s = createSupervisorState();
    const runRound = (verdict: 'revise' | 'approve') => {
      s = transition(s, { type: 'plan_produced' }).state;
      s = transition(s, { type: 'execution_finished' }).state;
      s = transition(s, { type: 'reviewed', verdict }).state;
    };
    runRound('revise'); // 0→1
    expect(s).toEqual({ phase: 'planning', round: 1 });
    runRound('revise'); // 1→2
    expect(s).toEqual({ phase: 'planning', round: 2 });
    runRound('approve'); // 2 done
    expect(s).toEqual({ phase: 'done', round: 2 });
  });
});
