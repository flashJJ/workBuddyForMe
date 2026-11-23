import { ApiError } from '@wbfm/shared/errors';
import { flowScheduleCreateSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id/schedules：全部定时配置 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk({ schedules: services.flowSchedules.service.list(id) });
});

/** POST /api/flows/:id/schedules：新增一条定时；服务端按时区计算下次执行 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(flowScheduleCreateSchema, await readJsonBody(request));
  try {
    return jsonOk({ schedule: services.flowSchedules.service.create(id, input) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : '定时配置无效');
  }
});
