import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v2.30 P1-M2：内容包更新检查（只读，手动触发）。
 * 上游不可达 / 限流时返回 status=unavailable，不抛 500；不下载、不自动替换。
 */
export const GET = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.contentPacks.checkUpdate(id));
});
