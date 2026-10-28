import { idParamSchema, workPlanReviewSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.8：计划评审（submit / approve / reject） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(workPlanReviewSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.reviewPlan(id, input));
});
