import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.31 P1 记忆空闲整理：同义主体归一、重复内容归档、悬空边清理（只归档不删除） */
export const POST = defineRoute(({ services }) => jsonOk(services.memories.consolidate()));
