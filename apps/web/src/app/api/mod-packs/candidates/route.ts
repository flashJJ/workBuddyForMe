import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/mod-packs/candidates — 导出勾选清单（仅自建卡 + 非内置场景） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.modPacks.listExportCandidates());
});
