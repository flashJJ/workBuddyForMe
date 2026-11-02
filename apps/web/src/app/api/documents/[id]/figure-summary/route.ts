import { figureSummarySchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.19 M4：按需用视觉模型解读图注/图表；未配置视觉模型时返回可读 422 */
export const POST = defineRoute(async ({ params, request, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(figureSummarySchema, await readJsonBody(request));
  return jsonOk(await services.documents.summarizeFigure(id, body.blockId, request.signal));
});
