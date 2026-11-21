import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
});

/** v4.19：供应商健康度（只读；本机 7 天窗口代理指标） */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(querySchema, new URL(request.url));
  return jsonOk(services.providerHealth.get(query.days ?? 7));
});
