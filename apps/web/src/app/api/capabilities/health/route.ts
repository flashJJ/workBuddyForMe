import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.12 M3：按需健康自检（不缓存；始终验签，不受安装策略影响） */
export const GET = defineRoute(async ({ services }) => jsonOk(services.capabilities.health()));
