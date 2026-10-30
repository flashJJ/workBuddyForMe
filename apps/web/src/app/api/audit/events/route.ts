import { auditQuerySchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/audit/events：按 created_at / kind / runId 过滤，seq 游标倒序翻页 */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(auditQuerySchema, new URL(request.url));
  return jsonOk(services.audit.list(query));
});
