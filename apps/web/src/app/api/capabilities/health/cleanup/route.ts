import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.12 M3：清理无数据库行的能力包目录 + 超过 24h 的 .staging / .backup 残留 */
export const POST = defineRoute(async ({ services }) =>
  jsonOk(services.capabilities.cleanupArtifacts()),
);
