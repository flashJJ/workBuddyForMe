import { idParamSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/meetings/:id/abort：打断（活跃发言 abort，状态→aborted；幂等） */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.meetings.abort(id);
  return jsonOk(services.meetings.getDetail(id)?.meeting ?? null);
});
