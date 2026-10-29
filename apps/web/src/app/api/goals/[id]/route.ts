import { idParamSchema, goalUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.8：目标编辑 / 结案 / 删除 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(goalUpdateSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.updateGoal(id, input));
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.workPlans.deleteGoal(id);
  return jsonOk({ id, deleted: true });
});
