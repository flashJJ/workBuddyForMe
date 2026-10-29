import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/subagents/providers：提供方列表与可用性（未启用时为空） */
export const GET = defineRoute(({ services }) =>
  jsonOk({ providers: services.subagentRuns.providers() }),
);
