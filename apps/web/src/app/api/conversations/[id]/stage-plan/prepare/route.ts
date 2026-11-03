import { idParamSchema, stagePlanPrepareSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.20：把阶段目标组装成任务文本；不发送、不修改会话模型 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(stagePlanPrepareSchema, await readJsonBody(request));
  return jsonOk(services.stagePlan.prepare(id, input.stepIndex));
});
