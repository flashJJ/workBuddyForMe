import { flowScheduleRunSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flows/:id/schedules/run：立即运行一次（可指定某条定时） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(flowScheduleRunSchema, await readJsonBody(request));
  return jsonOk(services.flowSchedules.service.runNow(id, input.scheduleId));
});
