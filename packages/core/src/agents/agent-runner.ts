import type { TokenUsage } from '@wbfm/shared/api';
import type {
  AgentHandoffPayload,
  AgentHandoffView,
  AgentPhase,
  AgentRole,
  AgentRunView,
  ReviewVerdictPayload,
} from '@wbfm/shared/schemas';
import type { SseEvent } from '@wbfm/shared/api';
import {
  advanceRound,
  consume,
  createBudgetState,
  exceededReason,
  toUsage,
  type BudgetState,
} from './budget';
import {
  createSupervisorState,
  isTerminal,
  transition,
  type SupervisorTerminalReason,
} from './supervisor';
import {
  AGENT_PROTOCOL_FAILURE_LIMITS,
  buildFallbackSubtask,
  buildFallbackVerdict,
  callWithFallback,
  withBudgetNote,
} from './runner-fallbacks';
import { GateMailbox, MAILBOX_DONE } from './gate-mailbox';
import { sys } from '../i18n/system-text';
import type {
  AgentClients,
  AgentRunnerDeps,
  PlannerRoundHistory,
  StartAgentRunInput,
} from './runner-types';

export type AgentRunEvent = SseEvent<
  | 'agent_phase'
  | 'agent_handoff'
  | 'agent_review'
  | 'agent_budget'
  | 'agent_tool_confirm'
  | 'done'
  | 'error'
>;

/** 带协议级容错的角色调用实现在 runner-fallbacks.ts（行数门禁外迁） */

function tokenUsage(run: AgentRunView): TokenUsage {
  return {
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    totalTokens: run.totalTokens,
  };
}

function missingRun(runId: string): never {
  throw new Error(sys('agentTrace.run.notFound', { id: runId }));
}

/**
 * 协作运行器：驱动 supervisor 状态机跑完规划-执行-审查轮次，全程落库 + 事件流。
 * 角色客户端全部注入（M1 测试 mock，M2 真实模型/task-loop）；
 * runner 不做提示词装配与 JSON 解析（纯协议在 planner/reviewer-protocol）。
 */
export function createAgentRunner(deps: AgentRunnerDeps) {
  const { repo, clients } = deps;

  async function* run(input: StartAgentRunInput): AsyncGenerator<AgentRunEvent, AgentRunView> {
    const runRow = input.runId
      ? (repo.getById(input.runId) ?? missingRun(input.runId))
      : repo.create({
          assistantId: input.assistantId,
          goal: input.goal,
          conversationId: input.conversationId ?? null,
          flowRunId: input.flowRunId ?? null,
          nodeExecutionId: input.nodeExecutionId ?? null,
          budget: input.budget,
        });
    const runId = runRow.id;
    const signal = input.signal;
    const isAborted = () => signal?.aborted === true;

    const evtPhase = (phaseName: AgentPhase, role: AgentRole | null, round: number): AgentRunEvent =>
      ({ event: 'agent_phase', data: { runId, phase: phaseName, role, round } });
    const evtBudget = (state: BudgetState): AgentRunEvent =>
      ({ event: 'agent_budget', data: { runId, usage: toUsage(state) } });
    const emitDone = (summary: string): AgentRunEvent => ({
      event: 'done',
      data: { content: summary, usage: tokenUsage(repo.getById(runId)!) },
    });
    const recordHandoff = (
      round: number,
      fromRole: AgentRole,
      toRole: AgentRole | 'user',
      payload: AgentHandoffPayload,
    ): AgentHandoffView => repo.addHandoff({ runId, roundNo: round, fromRole, toRole, payload });

    let budget = createBudgetState();
    let supervisor = createSupervisorState();
    let terminalReason: SupervisorTerminalReason | undefined;
    const history: PlannerRoundHistory[] = [];
    let outcome = runRow.finalOutcome;

    try {
      while (!isTerminal(supervisor)) {
        if (isAborted()) throw new Error('aborted');

        // ---- 规划（连续失败 → 原目标直派降级） ----
        yield evtPhase('planning', 'planner', budget.round);
        const plan = await callWithFallback(
          'planner',
          () =>
            clients.planner.plan(
              {
                goal: input.goal,
                history,
                availableToolScopes: input.availableToolScopes ?? [],
                knowledgeBaseHints: input.knowledgeBaseHints ?? [],
              },
              signal,
            ),
          AGENT_PROTOCOL_FAILURE_LIMITS.planner,
          () => ({
            subtask: buildFallbackSubtask(input.goal, input.availableToolScopes ?? []),
            usage: { promptTokens: 0, completionTokens: 0 },
          }),
          signal,
        );
        const currentSubtask = plan.value.subtask;
        if (!plan.degraded) {
          budget = consume(budget, plan.value.usage);
          repo.addTokens(runId, plan.value.usage);
          yield evtBudget(budget);
        }
        if (exceededReason(budget, runRow.budget)) break;
        const planHandoff = await recordHandoff(budget.round, 'planner', 'executor', {
          subtask: currentSubtask,
        });
        yield { event: 'agent_handoff', data: { runId, handoff: planHandoff } };
        supervisor = transition(supervisor, { type: 'plan_produced' }).state;

        // ---- 执行 ----
        yield evtPhase('executing', 'executor', budget.round);
        // M4：executor 内 task-loop 的 HITL 门控帧经邮箱竞速取出并下发，
        // 保证授权弹窗先于决策到达客户端（帧下发后决策由全局 confirmations 异步解决）
        const gateMailbox = new GateMailbox();
        const execSettled: Promise<
          | { value: Awaited<ReturnType<AgentClients['executor']['run']>> }
          | { error: unknown }
        > = clients
          .executor.run(
            {
              goal: input.goal,
              subtask: currentSubtask,
              round: budget.round,
              emitGateConfirm: (frame) => gateMailbox.post(frame),
            },
            signal,
          )
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          );
        for (;;) {
          const item = await gateMailbox.takeOrDone(execSettled, signal);
          if (item === MAILBOX_DONE) break;
          yield { event: 'agent_tool_confirm', data: { runId, ...item } };
        }
        const execResult = await execSettled;
        if ('error' in execResult) throw execResult.error;
        const exec = execResult.value;
        budget = consume(budget, { ...exec.usage, steps: exec.steps });
        repo.addTokens(runId, exec.usage);
        yield evtBudget(budget);
        outcome = exec.outcome;
        const execHandoff = await recordHandoff(budget.round, 'executor', 'reviewer', {
          outcome: exec.outcome,
        });
        yield { event: 'agent_handoff', data: { runId, handoff: execHandoff } };
        supervisor = transition(supervisor, { type: 'execution_finished' }).state;
        if (exceededReason(budget, runRow.budget)) break;

        // ---- 审查（连续失败 → 标注自动通过降级） ----
        yield evtPhase('reviewing', 'reviewer', budget.round);
        const review = await callWithFallback(
          'reviewer',
          () =>
            clients.reviewer.review(
              { goal: input.goal, subtask: currentSubtask, outcome: exec.outcome, round: budget.round },
              signal,
            ),
          AGENT_PROTOCOL_FAILURE_LIMITS.reviewer,
          () => ({ review: buildFallbackVerdict(), usage: { promptTokens: 0, completionTokens: 0 } }),
          signal,
        );
        if (!review.degraded) {
          budget = consume(budget, review.value.usage);
          repo.addTokens(runId, review.value.usage);
          yield evtBudget(budget);
        }
        const verdict: ReviewVerdictPayload = review.value.review;
        const reviewHandoff = await recordHandoff(
          budget.round,
          'reviewer',
          verdict.verdict === 'approve' ? 'user' : 'planner',
          {
            verdict: verdict.verdict,
            reviewNotes: verdict.reviewNotes,
            acceptanceResults: verdict.acceptanceResults,
          },
        );
        yield { event: 'agent_handoff', data: { runId, handoff: reviewHandoff } };
        yield { event: 'agent_review', data: { runId, round: budget.round, review: verdict } };

        history.push({ round: budget.round, subtask: currentSubtask, review: verdict });
        const next = transition(
          supervisor,
          { type: 'reviewed', verdict: verdict.verdict },
          runRow.budget,
        );
        supervisor = next.state;
        terminalReason = next.terminal;
        if (!isTerminal(supervisor)) {
          budget = advanceRound(budget);
          repo.setRound(runId, budget.round);
          yield evtBudget(budget);
        }
      }

      // ---- 终态：approved=done；reject=failed；预算触顶=budget_exceeded（交付最佳结果） ----
      yield evtPhase(supervisor.phase, null, budget.round);
      if (supervisor.phase === 'done') {
        repo.finalize(runId, { status: 'done', finalOutcome: outcome });
        yield emitDone(outcome?.summary ?? '');
        return repo.getById(runId)!;
      }

      const limit = exceededReason(budget, runRow.budget);
      if (terminalReason === 'budget_exceeded' || limit) {
        const reasonKind = (limit?.kind ?? 'rounds') as 'rounds' | 'steps' | 'tokens';
        const delivered = outcome ? withBudgetNote(outcome, reasonKind) : null;
        repo.finalize(runId, {
          status: 'budget_exceeded',
          finalOutcome: delivered,
          errorCode: 'AGENT_BUDGET_EXCEEDED',
          errorMessage: sys('agentTrace.budget.exceeded', {
            kind: sys(`agentTrace.budget.kind.${reasonKind}`),
          }),
        });
        yield emitDone(delivered?.summary ?? '');
        return repo.getById(runId)!;
      }

      const last = history[history.length - 1];
      repo.finalize(runId, {
        status: 'failed',
        finalOutcome: outcome,
        errorCode: 'AGENT_REJECTED',
        // 模型自写的审查意见原样入库（自由文本）；缺意见时用系统兜底标记
        errorMessage: last?.review.reviewNotes || sys('agentTrace.run.rejected'),
      });
      yield emitDone(outcome?.summary ?? '');
      return repo.getById(runId)!;
    } catch (error) {
      if (isAborted()) {
        repo.finalize(runId, { status: 'cancelled', errorCode: 'AGENT_CANCELLED', errorMessage: sys('agentTrace.run.cancelled') });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        repo.finalize(runId, { status: 'failed', errorCode: 'AGENT_RUN_FAILED', errorMessage: message });
        yield { event: 'error', data: { code: 'AGENT_RUN_FAILED', message } };
      }
      const stopped = repo.getById(runId)!;
      yield { event: 'done', data: { content: stopped.finalOutcome?.summary ?? '', usage: tokenUsage(stopped) } };
      return stopped;
    }
  }

  return { run };
}
