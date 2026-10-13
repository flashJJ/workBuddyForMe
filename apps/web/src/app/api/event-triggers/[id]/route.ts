import { z } from 'zod';
import { eventTriggerUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().min(1) });

/** v1.7 M5 触发器编辑/删除（404 由服务统一映射） */
export const PATCH = defineRoute(async ({ params, request, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(eventTriggerUpdateSchema, await readJsonBody(request));
  return jsonOk(services.eventTriggers.update(id, input));
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.eventTriggers.delete(id);
  return jsonOk({ id, deleted: true });
});
