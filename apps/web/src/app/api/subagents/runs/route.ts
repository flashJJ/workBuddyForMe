import { subagentRunInputSchema, subagentRunListQuerySchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/subagents/runs?limit=：最近外部代理运行记录 */
export const GET = defineRoute(({ request, services }) => {
  const { limit } = parseSearch(subagentRunListQuerySchema, new URL(request.url));
  return jsonOk(services.subagentRuns.list(limit));
});

/** POST /api/subagents/runs：创建运行（先审批，返回 queued 记录） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(subagentRunInputSchema, await readJsonBody(request));
  return jsonOk(services.subagentRuns.start(input), 201);
});
