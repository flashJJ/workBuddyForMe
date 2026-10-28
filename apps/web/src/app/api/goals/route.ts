import { z } from 'zod';
import { goalCreateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({ conversationId: z.string().min(1) });

/** v2.8：会话目标列表 / 新建 */
export const GET = defineRoute(({ request, services }) => {
  const { conversationId } = parseSearch(listQuerySchema, new URL(request.url));
  return jsonOk(services.workPlans.listGoals(conversationId));
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(goalCreateSchema, await readJsonBody(request));
  return jsonOk(services.workPlans.createGoal(input), 201);
});
