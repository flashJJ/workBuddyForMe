import { idParamSchema, stagePlanSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.20：读取会话阶段计划；无行返回 { plan: null } */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk({ plan: services.stagePlan.get(id) });
});

/** v2.20：保存完整计划；activeStep 变化时同一事务更新 conversations.model_id */
export const PUT = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const plan = parseBody(stagePlanSchema, await readJsonBody(request));
  return jsonOk(services.stagePlan.save(id, plan));
});
