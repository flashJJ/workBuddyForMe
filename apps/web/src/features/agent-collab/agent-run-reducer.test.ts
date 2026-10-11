'use client';

import { describe, expect, it } from 'vitest';
import type { AgentRunView } from '@wbfm/shared/schemas';
import {
  cardFromRun,
  initAgentCard,
  mergeRunView,
  reduceAgentFrame,
  type AgentStreamFrame,
} from './agent-run-reducer';

const BUDGET = { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80000 };

const f = {
  phase: (round: number, phase: 'planning' | 'executing' | 'reviewing', role: string): AgentStreamFrame =>
    ({ event: 'agent_phase', data: { runId: 'r1', phase, role, round } }) as AgentStreamFrame,
  planHandoff: (round: number): AgentStreamFrame =>
    ({
      event: 'agent_handoff',
      data: {
        runId: 'r1',
        handoff: {
          id: 'h1', runId: 'r1', roundNo: round, seq: 1, fromRole: 'planner', toRole: 'executor',
          createdAt: 't',
          payload: { subtask: { title: '查证', brief: '查清制度', acceptance: ['a1'], toolScopes: ['knowledge'] } },
        },
      },
    }) as AgentStreamFrame,
  execHandoff: (round: number): AgentStreamFrame =>
    ({
      event: 'agent_handoff',
      data: {
        runId: 'r1',
        handoff: {
          id: 'h2', runId: 'r1', roundNo: round, seq: 2, fromRole: 'executor', toRole: 'reviewer',
          createdAt: 't',
          payload: {
            outcome: {
              summary: '15 天',
              evidence: [{ documentId: 'd1', documentName: '制度.pdf', ordinal: 1 }],
              toolCalls: ['knowledge_search'],
              unfinished: [],
            },
          },
        },
      },
    }) as AgentStreamFrame,
  reviewHandoff: (round: number, verdict: 'approve' | 'revise' | 'reject', note?: string): AgentStreamFrame =>
    ({
      event: 'agent_handoff',
      data: {
        runId: 'r1',
        handoff: {
          id: 'h3', runId: 'r1', roundNo: round, seq: 3,
          fromRole: 'reviewer', toRole: verdict === 'approve' ? 'user' : 'planner',
          createdAt: 't',
          payload: {
            verdict,
            ...(note ? { reviewNotes: note } : {}),
            acceptanceResults: [{ passed: verdict === 'approve', note: '' }],
          },
        },
      },
    }) as AgentStreamFrame,
};

function runView(over: Partial<AgentRunView> = {}): AgentRunView {
  return {
    id: 'r1', conversationId: 'c1', flowRunId: null, nodeExecutionId: null,
    assistantId: 'a1', goal: 'g', status: 'done', roundNo: 0, budget: BUDGET,
    finalOutcome: null, promptTokens: 10, completionTokens: 5, totalTokens: 15,
    errorCode: null, errorMessage: null, createdAt: 't', updatedAt: 't', ...over,
  };
}

describe('agent-run-reducer（M4 泳道卡片状态纯函数）', () => {
  it('一轮完整协作：phase/handoff 收敛为 1 个 round 三段数据', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(s, f.phase(0, 'planning', 'planner'));
    expect(s.status).toBe('running');
    expect(s.activePhase).toBe('planning');
    s = reduceAgentFrame(s, f.planHandoff(0));
    s = reduceAgentFrame(s, f.phase(0, 'executing', 'executor'));
    s = reduceAgentFrame(s, f.execHandoff(0));
    s = reduceAgentFrame(s, f.phase(0, 'reviewing', 'reviewer'));
    s = reduceAgentFrame(s, f.reviewHandoff(0, 'approve'));
    s = reduceAgentFrame(s, ({ event: 'agent_phase', data: { runId: 'r1', phase: 'done', role: null, round: 0 } }) as AgentStreamFrame);

    expect(s.rounds).toHaveLength(1);
    const round = s.rounds[0]!;
    expect(round.subtask?.title).toBe('查证');
    expect(round.outcome?.summary).toBe('15 天');
    expect(round.review?.verdict).toBe('approve');
    expect(round.activePhase).toBeNull();
    expect(s.activeRole).toBeNull();
  });

  it('返工：第二轮追加同组，不覆盖首轮', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(s, f.planHandoff(0));
    s = reduceAgentFrame(s, f.execHandoff(0));
    s = reduceAgentFrame(s, f.reviewHandoff(0, 'revise', '缺证据'));
    s = reduceAgentFrame(s, f.planHandoff(1));
    expect(s.rounds).toHaveLength(2);
    expect(s.rounds[0]!.review?.verdict).toBe('revise');
    expect(s.rounds[1]!.subtask?.title).toBe('查证');
    expect(s.rounds[1]!.outcome).toBeNull();
  });

  it('budget 帧更新用量快照', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(
      s,
      ({ event: 'agent_budget', data: { runId: 'r1', usage: { round: 0, steps: 3, promptTokens: 1, completionTokens: 2, totalTokens: 3 } } }) as AgentStreamFrame,
    );
    expect(s.usage).toMatchObject({ steps: 3, totalTokens: 3 });
  });

  it('门控帧置 pendingConfirm，done 清除并写摘要', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(
      s,
      ({
        event: 'agent_tool_confirm',
        data: { runId: 'r1', callId: 'c1', tool: 'mouse_click', permission: 'danger', argsSummary: '{}', taskScope: 't1' },
      }) as AgentStreamFrame,
    );
    expect(s.pendingConfirm?.callId).toBe('c1');
    s = reduceAgentFrame(s, ({ event: 'done', data: { content: '结论', usage: null } }) as AgentStreamFrame);
    expect(s.pendingConfirm).toBeNull();
    expect(s.summary).toBe('结论');
  });

  it('error 帧收敛 failed + 消息', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(
      s,
      ({ event: 'error', data: { code: 'X', message: 'boom' } }) as AgentStreamFrame,
    );
    expect(s.status).toBe('failed');
    expect(s.errorMessage).toBe('boom');
  });

  it('mergeRunView：权威终态对账（budget_exceeded/清阶段/保留步数/交付摘要）', () => {
    let s = initAgentCard(BUDGET);
    s = reduceAgentFrame(
      s,
      ({ event: 'agent_budget', data: { runId: 'r1', usage: { round: 1, steps: 9, promptTokens: 1, completionTokens: 2, totalTokens: 3 } } }) as AgentStreamFrame,
    );
    s = reduceAgentFrame(s, f.phase(1, 'reviewing', 'reviewer'));
    s = mergeRunView(
      s,
      runView({
        status: 'budget_exceeded',
        roundNo: 1,
        finalOutcome: { summary: '部分结论', evidence: [], toolCalls: [], unfinished: ['u'] },
        totalTokens: 999,
        errorMessage: '预算触顶（rounds）',
      }),
    );
    expect(s.status).toBe('budget_exceeded');
    expect(s.activePhase).toBeNull();
    expect(s.summary).toBe('部分结论');
    expect(s.usage?.steps).toBe(9);
    expect(s.usage?.totalTokens).toBe(999);
    expect(s.errorMessage).toContain('预算触顶');
  });

  it('cardFromRun：终态 handoffs 回放构图', () => {
    const run = runView({ status: 'done' });
    const handoffs = [
      (f.planHandoff(0) as Extract<AgentStreamFrame, { event: 'agent_handoff' }>).data.handoff,
      (f.execHandoff(0) as Extract<AgentStreamFrame, { event: 'agent_handoff' }>).data.handoff,
      (f.reviewHandoff(0, 'approve') as Extract<AgentStreamFrame, { event: 'agent_handoff' }>).data.handoff,
    ];
    const card = cardFromRun(run, handoffs);
    expect(card.status).toBe('done');
    expect(card.rounds).toHaveLength(1);
    expect(card.rounds[0]!.review?.verdict).toBe('approve');
  });
});
