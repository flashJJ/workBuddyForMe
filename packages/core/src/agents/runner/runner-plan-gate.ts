import type { AgentRunRepository } from '@wbfm/database';
import type { AgentRunView, SubtaskSpec } from '@wbfm/shared/schemas';
import { sys } from '../../i18n/system-text';

type PlanPreviewEvent = {
  event: 'agent_plan_preview';
  data: { runId: string; round: number; subtask: SubtaskSpec };
};

/**
 * v4.7 P1：计划确认步骤（从 runner 外迁守行数门禁）。
 * 先下发只读预览；批准返回 null，拒绝则直接落 cancelled 并返回终态视图。
 */
export async function* reviewPlanIfNeeded(input: {
  repo: AgentRunRepository;
  runId: string;
  round: number;
  subtask: SubtaskSpec;
  awaitPlanApproval?: (subtask: SubtaskSpec, round: number) => Promise<'approve' | 'reject'>;
}): AsyncGenerator<PlanPreviewEvent, AgentRunView | null> {
  yield {
    event: 'agent_plan_preview',
    data: { runId: input.runId, round: input.round, subtask: input.subtask },
  };
  const decision = (await input.awaitPlanApproval?.(input.subtask, input.round)) ?? 'approve';
  if (decision !== 'reject') return null;
  return input.repo.finalize(input.runId, {
    status: 'cancelled',
    errorCode: 'AGENT_PLAN_REJECTED',
    errorMessage: sys('agentTrace.run.planRejected'),
  });
}
