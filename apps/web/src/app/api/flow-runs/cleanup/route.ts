import { ApiError } from '@wbfm/shared/errors';
import { flowRunCleanupSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flow-runs/cleanup：立即清理，支持 dry-run 预览 */
export const POST = defineRoute(async ({ request, services }) => {
  if (!services.flowReliability) throw ApiError.validation('运行兜底服务未启用');
  const body = parseBody(flowRunCleanupSchema, await readJsonBody(request));
  return jsonOk(services.flowReliability.retention.cleanup({ dryRun: Boolean(body.dryRun) }));
});
