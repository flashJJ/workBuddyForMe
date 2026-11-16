import { createSceneContentService } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/scene-content — 已启用 scene-pack 的会话级场景快照 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createSceneContentService({ db: services.db }).get()),
);
