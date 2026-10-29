import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.10：卸载能力包（先撤销 effect 再删文件与记录） */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.capabilities.uninstall(id);
  return jsonOk({ id, deleted: true });
});
