import { idParamSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/meetings/:id/finish：手动结束（活跃发言先 abort，状态→finished） */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.meetings.finish(id);
  return jsonOk(services.meetings.getDetail(id)?.meeting ?? null);
});
