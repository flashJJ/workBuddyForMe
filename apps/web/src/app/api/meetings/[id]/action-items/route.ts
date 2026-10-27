import { idParamSchema, meetingActionItemCreateSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/meetings/:id/action-items：行动项列表 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.meetings.listActionItems(id));
});

/** POST /api/meetings/:id/action-items：手动新增行动项（source=manual） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(meetingActionItemCreateSchema, await readJsonBody(request));
  return jsonOk(services.meetings.createActionItem(id, input), 201);
});
