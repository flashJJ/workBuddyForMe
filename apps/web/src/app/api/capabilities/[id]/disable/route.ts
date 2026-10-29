import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.10：停用能力包（撤销 effect，保留包文件） */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.capabilities.disable(id));
});
