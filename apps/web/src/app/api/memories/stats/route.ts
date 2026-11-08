import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.26 P2 记忆线上计数：零召回率 / superseded 比例 / 用户纠正次数 */
export const GET = defineRoute(({ services }) => jsonOk(services.memories.getStats()));
