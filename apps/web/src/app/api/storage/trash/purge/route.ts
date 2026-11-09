import { purgeTrash } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** POST /api/storage/trash/purge — 清理已到期（默认 7 天前）的回收日期目录 */
export const POST = defineRoute(() => jsonOk(purgeTrash()));
