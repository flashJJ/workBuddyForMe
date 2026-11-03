import { z } from 'zod';
import { idParamSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams, parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  scope: z.enum(['chat', 'task', 'flow', 'agent']).optional(),
});

/** v2.20 M2：会话过程图快照（chat/task/flow/agent；会议走独立入口） */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.conversations.get(id);
  const query = parseSearch(querySchema, new URL(request.url));
  return jsonOk(services.runGraph.conversationGraph(id, query));
});
