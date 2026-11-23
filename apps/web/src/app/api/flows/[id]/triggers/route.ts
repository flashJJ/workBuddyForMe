import { ApiError } from '@wbfm/shared/errors';
import { flowTriggerCreateSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id/triggers：触发器列表 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk({ triggers: services.flowTriggers.service.list(id) });
});

/** POST /api/flows/:id/triggers：创建触发器；Webhook 的 secret 仅本次返回 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(flowTriggerCreateSchema, await readJsonBody(request));
  try {
    const result = services.flowTriggers.service.create(id, input);
    return jsonOk({ trigger: result.trigger, ...(result.secret ? { secret: result.secret } : {}) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : '触发器配置无效');
  }
});
