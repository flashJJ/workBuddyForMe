import { z } from 'zod';
import { workPlanCreateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({ conversationId: z.string().min(1).optional() });

/** v2.8：计划列表（可按会话过滤）/ 新建计划或待办清单 */
export const GET = defineRoute(({ request, services }) => {
  const { conversationId } = parseSearch(listQuerySchema, new URL(request.url));
  return jsonOk(services.workPlans.listPlans(conversationId));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(workPlanCreateSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.createPlan(input), 201);
});
