import type {
  AgentRunRepository,
  TaskRunCheckpointRepository,
} from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  AGENT_BUDGET_BOUNDS,
  type AgentBudget,
  type AgentRunView,
} from '@wbfm/shared/schemas';

/** v4.7 P1：续跑预算——沿用原上限，token 取剩余，轮次扣已用 */
export function resumeBudget(source: AgentRunView): AgentBudget {
  return {
    maxRounds: Math.max(1, source.budget.maxRounds - source.roundNo),
    maxSteps: source.budget.maxSteps,
    maxTotalTokens: Math.max(
      AGENT_BUDGET_BOUNDS.maxTotalTokens.min,
      source.budget.maxTotalTokens - source.totalTokens,
    ),
  };
}

/**
 * 从可续跑检查点续跑：新建 run（记录来源），由调用方启动执行。
 * 校验失败抛 ApiError（409/404），与路由层语义一致。
 */
export function createResumedRun(params: {
  repo: AgentRunRepository;
  checkpoints: TaskRunCheckpointRepository;
  runId: string;
}): AgentRunView {
  const { repo, checkpoints, runId } = params;
  const source = repo.getById(runId);
  if (!source) throw ApiError.notFound('协作运行', runId);
  if (source.errorCode !== 'INTERRUPTED') {
    throw ApiError.conflict('该运行并非中断收敛，无法续跑');
  }
  const checkpoint = checkpoints.getByRunId(runId);
  if (!checkpoint?.resumable) throw ApiError.conflict('该运行没有可续跑的检查点');

  const resumed = repo.create({
    assistantId: source.assistantId,
    goal: source.goal,
    conversationId: source.conversationId,
    budget: resumeBudget(source),
    resumedFromRunId: source.id,
  });
  // 先消费源检查点：并发点两次「继续」时第二次直接 409
  checkpoints.markNotResumable(source.id, `已续跑：${resumed.id}`);
  return resumed;
}
