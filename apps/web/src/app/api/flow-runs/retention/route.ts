import { ApiError } from '@wbfm/shared/errors';
import { flowRunRetentionSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flow-runs/retention：运行保留策略 */
export const GET = defineRoute(({ services }) => {
  if (!services.flowReliability) throw ApiError.validation('运行兜底服务未启用');
  return jsonOk(services.flowReliability.retention.getPolicy());
});

/** PUT /api/flow-runs/retention：更新保留策略 */
export const PUT = defineRoute(async ({ request, services }) => {
  if (!services.flowReliability) throw ApiError.validation('运行兜底服务未启用');
  const body = parseBody(flowRunRetentionSchema, await readJsonBody(request));
  services.flowReliability.retention.setPolicy(body);
  return jsonOk(services.flowReliability.retention.getPolicy());
});
