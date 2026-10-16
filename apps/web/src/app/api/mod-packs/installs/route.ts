import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/mod-packs/installs — mod 包安装登记记录 */
export const GET = defineRoute(({ services }) => {
  return jsonOk({ installs: services.modPacks.listInstalls() });
});
