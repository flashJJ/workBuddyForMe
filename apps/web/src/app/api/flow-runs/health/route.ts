import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/flow-runs/health：调度/文件/补偿/端点/定时/触发/保留只读健康 */
export const GET = defineRoute(({ services }) => {
  if (!services.flowReliability) throw ApiError.validation('运行兜底服务未启用');
  return jsonOk(services.flowReliability.health.snapshot());
});
