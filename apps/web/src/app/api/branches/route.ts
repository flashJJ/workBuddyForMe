import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  childConversationId: z.string().trim().min(1).max(80),
});

/** v2.21 M3：按子会话反查来源分支；无来源时 branch 为 null */
export const GET = defineRoute(({ request, services }) => {
  const { childConversationId } = parseSearch(querySchema, new URL(request.url));
  return jsonOk({ branch: services.branches.findByChild(childConversationId) });
});
