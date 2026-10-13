import {
  scheduledTaskCreateSchema,
  scheduledTaskListQuerySchema,
} from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v1.7 角色化提醒：列表（可按助手过滤）与新建 */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(scheduledTaskListQuerySchema, new URL(request.url));
  return jsonOk(services.schedules.list(query.assistantId));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(scheduledTaskCreateSchema, await readJsonBody(request));
  return jsonOk(services.schedules.create(input), 201);
});
