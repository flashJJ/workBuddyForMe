import { z } from 'zod';
import { SESSION_EVENT_SCOPES } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  scope: z.enum(SESSION_EVENT_SCOPES),
  scopeId: z.string().min(1),
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

/** v2.9：时间线事件（按 seq 升序；after 用于增量续传） */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(querySchema, new URL(request.url));
  return jsonOk(
    services.sessionLog.timeline(query.scope, query.scopeId, query.after ?? 0, query.limit ?? 500),
  );
});
