import { ApiError } from '@wbfm/shared/errors';
import { agentPlanDecisionSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/runs/:id/plan：提交只读计划预览的决策。
 * - approve：继续执行当前子任务
 * - reject：终止协作（status=cancelled，errorCode=AGENT_PLAN_REJECTED）
 * 无待确认计划或已终态：409；不存在：404。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(agentPlanDecisionSchema, await readJsonBody(request));
  if (!services.agentRuns.hasClientsChannel()) {
    throw ApiError.notImplemented('多智能体协作通道未接通');
  }
  services.agentRuns.resolvePlan(id, input);
  return jsonOk({ id, decision: input.decision });
});
