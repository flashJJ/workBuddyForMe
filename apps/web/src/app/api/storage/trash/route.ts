import { listTrash } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/storage/trash — v2.32：回收目录清单 */
export const GET = defineRoute(() => jsonOk(listTrash()));
