import { createMotionContentService } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/motion-content — 默认内容 + 已启用 motion-pack 的会话级快照 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createMotionContentService({ db: services.db }).get()),
);
