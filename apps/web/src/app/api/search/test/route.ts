import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.17：按当前搜索设置发起一次探活；失败返回 200 + ok:false，便于设置页展示原因 */
export const POST = defineRoute(async ({ services }) => {
  const result = await services.search.testConnection();
  return jsonOk(result);
});
