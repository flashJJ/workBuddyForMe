import { z } from 'zod';
import { SESSION_EVENT_SCOPES } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(1),
  scope: z.enum(SESSION_EVENT_SCOPES).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** v2.9：跨会话/运行事件检索（CJK 2 字词可命中） */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(querySchema, new URL(request.url));
  const fromIso = query.from ? new Date(query.from).toISOString() : undefined;
  const toIso = query.to ? new Date(query.to).toISOString() : undefined;
  return jsonOk(
    services.sessionLog.search(query.q, {
      ...(query.scope ? { scope: query.scope } : {}),
      ...(fromIso ? { fromIso } : {}),
      ...(toIso ? { toIso } : {}),
      limit: query.limit ?? 100,
    }),
  );
});
