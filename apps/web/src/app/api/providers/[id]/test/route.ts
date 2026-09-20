import { idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 使用已保存凭据发起连通性测试，失败由统一错误层归一化为 502/504 */
export const POST = defineRoute(async ({ params, services, request }) => {
  const { id } = parseParams(idParamSchema, params);
  await services.providers.testConnection(id, request.signal);
  return jsonOk({ ok: true });
});
