import { ApiError } from '@wbfm/shared/errors';
import { flowScheduleUpsertSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id/schedule：定时配置（未配置返回 null） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk({ schedule: services.flowSchedules.service.get(id) });
});

/** PUT /api/flows/:id/schedule：保存或更新；服务端计算下次执行时间 */
export const PUT = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(flowScheduleUpsertSchema, await readJsonBody(request));
  try {
    return jsonOk({ schedule: services.flowSchedules.service.upsert(id, input) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : '定时配置无效');
  }
});

/** DELETE /api/flows/:id/schedule：删除配置 */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk({ removed: services.flowSchedules.service.remove(id) });
});
