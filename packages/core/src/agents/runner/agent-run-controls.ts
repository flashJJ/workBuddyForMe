import type { AgentRunRepository, TaskRunCheckpointRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { AgentPlanDecision, AgentRunView } from '@wbfm/shared/schemas';
import { createResumedRun } from './agent-run-resume';

/**
 * v4.7 P1：运行控制（计划决策/续跑）从服务主体外迁守行数门禁。
 * 所有校验失败仍抛 ApiError，路由层语义不变。
 */
export function createRunControls(params: {
  repo: AgentRunRepository;
  checkpoints: TaskRunCheckpointRepository;
  resolvePlanGate: (runId: string, decision: AgentPlanDecision) => boolean;
}) {
  const { repo, checkpoints } = params;
  return {
    resolvePlan(runId: string, decision: AgentPlanDecision): boolean {
      const run = repo.getById(runId);
      if (!run) throw ApiError.notFound('协作运行', runId);
      if (run.status !== 'running') {
        throw ApiError.conflict(`协作已终态（${run.status}），无法提交计划决策`);
      }
      if (!params.resolvePlanGate(runId, decision)) {
        throw ApiError.conflict('当前没有等待确认的计划');
      }
      return true;
    },

    async resume(
      runId: string,
      startOwned: (run: AgentRunView) => Promise<unknown>,
    ): Promise<AgentRunView> {
      const resumed = createResumedRun({ repo, checkpoints, runId });
      try {
        await startOwned(resumed);
      } catch (error) {
        repo.finalize(resumed.id, {
          status: 'failed',
          errorCode: 'AGENT_RESUME_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      return repo.getById(resumed.id)!;
    },
  };
}
