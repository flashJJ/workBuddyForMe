import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { flowTriggerUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1), triggerId: z.string().min(1) });

/** PATCH /api/flows/:id/triggers/:triggerId：启停、改名或更新文件配置 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id, triggerId } = parseParams(paramsSchema, params);
  const input = parseBody(flowTriggerUpdateSchema, await readJsonBody(request));
  try {
    return jsonOk({ trigger: services.flowTriggers.service.update(id, triggerId, input) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : '触发器更新无效');
  }
});

/** DELETE /api/flows/:id/triggers/:triggerId */
export const DELETE = defineRoute(({ params, services }) => {
  const { id, triggerId } = parseParams(paramsSchema, params);
  return jsonOk({ removed: services.flowTriggers.service.remove(id, triggerId) });
});
