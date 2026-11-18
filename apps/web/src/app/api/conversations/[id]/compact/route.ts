import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v4.8：用户显式压缩上下文（跳过水位阈值，写 context_condensed 事件） */
export const POST = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.contextCompaction.compactNow(id));
});
