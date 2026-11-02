import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.18 M4：可用内容包清单（含是否已导入；正文不预取） */
export const GET = defineRoute(({ services }) => jsonOk(services.contentPacks.list()));
