import { idParamSchema, meetingTurnSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meetings/:id/turns：用户发言/调度动作。
 * 异步执行（响应不等待模型），下一位发言者由服务端按会议 mode 决定；
 * manual 无 @ 时 triggered=false（只留存用户消息）。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(meetingTurnSchema, await readJsonBody(request));
  const result = services.meetings.submitTurn(id, input.content);
  return jsonOk(result);
});
