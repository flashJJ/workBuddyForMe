import { createWallpaperContentService } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/wallpaper-content — 已启用壁纸包的背景源与快照版本 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createWallpaperContentService({ db: services.db }).get()),
);
