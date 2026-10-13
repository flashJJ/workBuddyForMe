import {
  eventTriggerCreateSchema,
  eventTriggerListQuerySchema,
} from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v1.7 M5 自定义短语触发器：列表（可按助手过滤）/新建 */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(eventTriggerListQuerySchema, new URL(request.url));
  return jsonOk(services.eventTriggers.list(query.assistantId));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(eventTriggerCreateSchema, await readJsonBody(request));
  return jsonOk(services.eventTriggers.create(input), 201);
});
