import { createPropContentService } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/prop-content — 内置道具 + 已启用 prop-pack 的会话级快照 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createPropContentService({ db: services.db }).get()),
);
