import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.10：能力包列表 */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.capabilities.list());
});
