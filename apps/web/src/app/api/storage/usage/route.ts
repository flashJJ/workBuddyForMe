import { getStorageUsage } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/storage/usage — v2.32：数据根分项占用（30 秒短时缓存） */
export const GET = defineRoute(() => jsonOk(getStorageUsage()));
