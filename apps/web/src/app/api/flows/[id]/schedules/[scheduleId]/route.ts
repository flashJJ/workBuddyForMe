import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { flowScheduleUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1), scheduleId: z.string().min(1) });

/** PATCH /api/flows/:id/schedules/:scheduleId：更新单条定时 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id, scheduleId } = parseParams(paramsSchema, params);
  const input = parseBody(flowScheduleUpdateSchema, await readJsonBody(request));
  try {
    return jsonOk({ schedule: services.flowSchedules.service.update(id, scheduleId, input) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : '定时更新无效');
  }
});

/** DELETE /api/flows/:id/schedules/:scheduleId */
export const DELETE = defineRoute(({ params, services }) => {
  const { id, scheduleId } = parseParams(paramsSchema, params);
  return jsonOk({ removed: services.flowSchedules.service.remove(id, scheduleId) });
});
