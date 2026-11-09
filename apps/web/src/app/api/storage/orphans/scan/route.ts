import { scanOrphanAttachments } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** POST /api/storage/orphans/scan — v2.32：dry-run 扫描孤儿附件（只返回计数，不移动） */
export const POST = defineRoute(({ services }) => jsonOk(scanOrphanAttachments(services.db)));
