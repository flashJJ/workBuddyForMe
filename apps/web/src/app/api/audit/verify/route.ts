import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** POST /api/audit/verify：按 seq 重算哈希链，返回首个断链 seq（校验本身也落账本） */
export const POST = defineRoute(({ services }) => jsonOk(services.audit.verify()));
