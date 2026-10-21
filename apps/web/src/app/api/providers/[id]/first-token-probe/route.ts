import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v2.4 M1 T5：首字延迟自检——对该供应商跑一次固定极短 prompt 的流式探针，
 * 返回首 token 延迟与总耗时（measurable=false 表示无可用对话模型）。
 */
export const POST = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.providers.firstTokenProbe(id));
});
