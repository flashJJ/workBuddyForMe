import { scheduledTaskUpdateSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v1.7 提醒编辑（时间字段任一变化服务端重算 next_run_at）与删除 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(scheduledTaskUpdateSchema, await readJsonBody(request));
  return jsonOk(services.schedules.update(id, input));
});

export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.schedules.delete(id);
  return jsonOk({ id, deleted: true });
});
