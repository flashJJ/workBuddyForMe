import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/artifacts — v2.32：跨会话产物清单（最新在前，最多 200 条） */
export const GET = defineRoute(({ services }) => {
  const items = services.attachments.listArtifacts();
  return jsonOk({ items, total: items.length });
});
