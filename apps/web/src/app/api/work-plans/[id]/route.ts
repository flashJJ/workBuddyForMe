import { idParamSchema, workPlanUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.8：计划详情 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.workPlans.getPlan(id));
});

/** 改写计划（仅 draft / pending_review / rejected；步骤全量替换） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(workPlanUpdateSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.updatePlan(id, input));
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.workPlans.deletePlan(id);
  return jsonOk({ id, deleted: true });
});
