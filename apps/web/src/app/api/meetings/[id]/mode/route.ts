import { idParamSchema, meetingModeUpdateSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** PATCH /api/meetings/:id/mode：切换调度（仅 active；auto 超限服务端会自动收回） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(meetingModeUpdateSchema, await readJsonBody(request));
  services.meetings.updateMode(id, input.mode);
  const detail = services.meetings.getDetail(id);
  return jsonOk(detail?.meeting ?? null);
});
